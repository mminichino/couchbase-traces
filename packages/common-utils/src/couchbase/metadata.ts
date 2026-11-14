import {
  COLUMNS_CACHE_TTL_MS,
  defaultFieldMetadataDateRange,
  type Field,
  type KeyValues,
  MetadataCache,
  type MetricNames,
  type TableMetadata,
} from '@/core/metadata';
import { parseServerVersion, type ServerVersion } from '@/core/serverVersion';
import { columnTypeToJSType, JSDataType } from '@/query/columnTypes';
import type { ColumnMeta } from '@/query/types';

import { isAccessDeniedError } from './errors';
import { type InferredField, inferredToColumnType, parseInfer } from './infer';
import {
  inferStatement,
  keyspaceList,
  mapKeys,
  metricNames,
  sampledValues,
  validateStatement,
  versionStatement,
} from './metadataSql';
import type { SqlPP } from './sqlpp';
import type { TimeFormat } from './time';
import type { DataClient, Keyspace } from './types';

const EMPTY_COLUMN = {
  codec_expression: '',
  comment: '',
  default_expression: '',
  default_type: '',
  ttl_expression: '',
};

type Tc = {
  connectionId: string;
  databaseName: string;
  tableName: string;
  scopeName?: string;
};

export class Metadata {
  constructor(
    private readonly client: DataClient,
    private readonly cache: MetadataCache,
    private readonly opts?: {
      sampleSize?: number;
      defaultLookback?: [Date, Date];
    },
  ) {}

  getQuerySettings(): Record<string, unknown> {
    return this.cache.get('cb:settings') ?? {};
  }

  setQuerySettings(settings: Record<string, unknown>): void {
    const current = this.getQuerySettings();
    this.cache.set('cb:settings', { ...current, ...settings });
  }

  async getColumns(args: Tc): Promise<ColumnMeta[]> {
    return this.cache.getOrFetch(
      this.key(args, 'columns'),
      async () => {
        const fields = await this.inferFields(args);
        return fields
          .filter(f => f.path.length === 1)
          .map(f => ({
            ...EMPTY_COLUMN,
            name: f.path[0],
            type: inferredToColumnType(f, fields),
          }));
      },
      { ttlMs: COLUMNS_CACHE_TTL_MS },
    );
  }

  async getColumn(args: Tc & { column: string; matchLowercase?: boolean }) {
    const columns = await this.getColumns(args);
    return columns.find(c =>
      args.matchLowercase
        ? c.name.toLowerCase() === args.column.toLowerCase()
        : c.name === args.column,
    );
  }

  async getMapKeys(
    args: Tc & {
      column: string;
      maxKeys?: number;
      dateRange?: [Date, Date];
      timestampValueExpression?: string;
    },
  ) {
    const max = args.maxKeys ?? 1000;
    const { from, to, ts, format } = await this.time(args);
    const q = mapKeys(
      keyspaceOf(args),
      args.column,
      ts,
      format,
      from,
      to,
      this.rowSample(),
      max,
    );
    const rows = await this.rows(args, q);
    return rows.map(row => String(raw(row))).filter(Boolean);
  }

  async getMapValues(
    args: Tc & {
      column: string;
      key?: string;
      maxValues?: number;
      dateRange?: [Date, Date];
      timestampValueExpression?: string;
    },
  ): Promise<string[]> {
    const values = await this.valueCounts(
      args,
      mapValueExpr(args.column, args.key),
      args.maxValues ?? 20,
    );
    return values.map(v => v.value);
  }

  async getJSONKeys(
    args: Tc & { column: string; maxKeys?: number },
  ): Promise<{ key: string; chType: string }[]> {
    const fields = await this.inferFields(args);
    return fields
      .filter(
        f =>
          f.path[0] === args.column &&
          f.path.length === 2 &&
          f.path[1] !== '[]',
      )
      .slice(0, args.maxKeys ?? 1000)
      .map(f => ({
        key: f.path[1],
        chType: inferredToColumnType(f, fields),
      }));
  }

  async getAllFields(
    args: Tc & { dateRange?: [Date, Date]; timestampValueExpression?: string },
  ): Promise<Field[]> {
    const columns = await this.getColumns(args);
    const fields: Field[] = columns
      .filter(c => c.type !== 'JSON')
      .map(c => ({
        path: [c.name],
        type: c.type,
        jsType: columnTypeToJSType(c.type),
      }));
    for (const column of columns) {
      const js = columnTypeToJSType(column.type);
      if (js === 'json') {
        const paths = await this.getJSONKeys({ ...args, column: column.name });
        for (const path of paths) {
          fields.push({
            path: [column.name, path.key],
            type: path.chType,
            jsType: columnTypeToJSType(path.chType),
          });
        }
      } else if (js === 'map') {
        const keys = await this.getMapKeys({ ...args, column: column.name });
        for (const key of keys) {
          fields.push({
            path: [column.name, key],
            type: 'String',
            jsType: JSDataType.String,
          });
        }
      }
    }
    return fields;
  }

  async getKeyValues(args: {
    chartConfig: {
      connection: string;
      from: {
        databaseName: string;
        tableName: string;
        scopeName?: string;
      };
      dateRange: [Date, Date];
      timestampValueExpression?: string;
    };
    keys: string[];
    limit?: number;
  }): Promise<KeyValues[]> {
    const tc = tcFrom(args.chartConfig);
    const out: KeyValues[] = [];
    for (const key of args.keys) {
      const values = await this.valueCounts(
        {
          ...tc,
          dateRange: args.chartConfig.dateRange,
          timestampValueExpression: args.chartConfig.timestampValueExpression,
        },
        qualifyValue(key),
        args.limit ?? 20,
      );
      out.push({ key, value: values.map(v => v.value) });
    }
    return out;
  }

  async getAllKeyValues(args: {
    connectionId: string;
    databaseName: string;
    tableName: string;
    scopeName?: string;
    keyExpressions: string[];
    maxValuesPerKey?: number;
    dateRange: [Date, Date];
    timestampValueExpression: string;
  }): Promise<KeyValues[]> {
    return this.getKeyValues({
      chartConfig: {
        connection: args.connectionId,
        from: args,
        dateRange: args.dateRange,
        timestampValueExpression: args.timestampValueExpression,
      },
      keys: args.keyExpressions,
      limit: args.maxValuesPerKey,
    });
  }

  async getValuesDistribution(args: {
    chartConfig: {
      connection: string;
      from: {
        databaseName: string;
        tableName: string;
        scopeName?: string;
      };
      dateRange: [Date, Date];
      timestampValueExpression?: string;
    };
    key: string;
    limit?: number;
  }): Promise<Map<string, number>> {
    const tc = tcFrom(args.chartConfig);
    const values = await this.valueCounts(
      {
        ...tc,
        dateRange: args.chartConfig.dateRange,
        timestampValueExpression: args.chartConfig.timestampValueExpression,
      },
      qualifyValue(args.key),
      args.limit ?? 100,
    );
    const total = values.reduce((sum, row) => sum + row.count, 0) || 1;
    return new Map(values.map(row => [row.value, (row.count / total) * 100]));
  }

  async getKeyValuesWithMVs(
    args: Parameters<Metadata['getKeyValues']>[0],
  ): Promise<KeyValues[]> {
    return this.getKeyValues(args);
  }

  async getMetricNames(
    args: Tc & {
      dateRange: [Date, Date];
      timestampValueExpression: string;
      namePattern?: string;
      limit?: number;
    },
  ): Promise<MetricNames> {
    const limit = args.limit ?? 500;
    const q = metricNames(
      keyspaceOf(args),
      `m.${quoteTimestamp(args.timestampValueExpression)}`,
      'iso8601',
      args.dateRange[0],
      args.dateRange[1],
      limit + 1,
      args.namePattern,
    );
    const names = (await this.rows(args, q))
      .map(row => String(raw(row)))
      .filter(Boolean);
    return { names: names.slice(0, limit), truncated: names.length > limit };
  }

  async getTableMetadata(args: Tc): Promise<TableMetadata> {
    return emptyTable(args);
  }

  async getAllTableMetadata(args: {
    databaseName: string;
    connectionId: string;
  }): Promise<TableMetadata[]> {
    const spaces = await this.listKeyspaces({
      connectionId: args.connectionId,
    });
    return spaces
      .filter(ks => ks.bucket === args.databaseName)
      .map(ks =>
        emptyTable({
          databaseName: args.databaseName,
          tableName: ks.collection,
        }),
      );
  }

  async getServerVersion(args: {
    connectionId: string;
  }): Promise<ServerVersion | undefined> {
    const rows = await this.rows(args, versionStatement());
    const version = rows.length > 0 ? String(raw(rows[0])) : '';
    return parseServerVersion(version);
  }

  async getOtelTables(args: { connectionId: string }) {
    const names = new Set([
      'otel_logs',
      'otel_traces',
      'hyperdx_sessions',
      'otel_metrics_gauge',
      'otel_metrics_sum',
      'otel_metrics_summary',
      'otel_metrics_histogram',
      'otel_metrics_exp_histogram',
      'otel_metrics_exponential_histogram',
    ]);
    const spaces = (await this.listKeyspaces(args)).filter(ks =>
      names.has(ks.collection),
    );
    if (spaces.length === 0) return null;
    const bucket = spaces[0].bucket;
    const scopeName = spaces[0].scope;
    const inBucket = spaces.filter(
      ks => ks.bucket === bucket && ks.scope === scopeName,
    );
    const has = (name: string) => inBucket.some(ks => ks.collection === name);
    return {
      database: bucket,
      databaseName: bucket,
      scopeName,
      tables: {
        logs: has('otel_logs') ? 'otel_logs' : undefined,
        traces: has('otel_traces') ? 'otel_traces' : undefined,
        sessions: has('hyperdx_sessions') ? 'hyperdx_sessions' : undefined,
        metrics: {
          gauge: has('otel_metrics_gauge') ? 'otel_metrics_gauge' : undefined,
          sum: has('otel_metrics_sum') ? 'otel_metrics_sum' : undefined,
          summary: has('otel_metrics_summary')
            ? 'otel_metrics_summary'
            : undefined,
          histogram: has('otel_metrics_histogram')
            ? 'otel_metrics_histogram'
            : undefined,
          expHistogram: has('otel_metrics_exponential_histogram')
            ? 'otel_metrics_exponential_histogram'
            : has('otel_metrics_exp_histogram')
              ? 'otel_metrics_exp_histogram'
              : undefined,
        },
      },
    };
  }

  async listKeyspaces(args: { connectionId: string }): Promise<Keyspace[]> {
    const rows = await this.rows(args, keyspaceList());
    return rows
      .map(row => {
        const value = raw(row);
        if (Array.isArray(value)) {
          return {
            bucket: String(value[0]),
            scope: String(value[1]),
            collection: String(value[2]),
          };
        }
        return { bucket: '', scope: '', collection: '' };
      })
      .filter(ks => ks.bucket && ks.scope !== '_system');
  }

  async validateExpression(
    args: Tc & { expression: string },
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await this.rows(
        args,
        validateStatement(keyspaceOf(args), args.expression),
      );
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private inferSample(): number {
    return Math.min(this.opts?.sampleSize ?? 1000, 10_000);
  }

  private rowSample(): number {
    return Math.min(this.opts?.sampleSize ?? 10_000, 10_000);
  }

  private async inferFields(args: Tc): Promise<InferredField[]> {
    try {
      const rows = await this.rows(
        args,
        inferStatement(keyspaceOf(args), this.inferSample()),
      );
      return parseInfer(rows.map(raw));
    } catch (err) {
      if (isAccessDeniedError(err)) {
        console.warn('INFER failed for permissions', err);
        return [];
      }
      throw err;
    }
  }

  private async time(
    args: Tc & { dateRange?: [Date, Date]; timestampValueExpression?: string },
  ): Promise<{ from: Date; to: Date; ts: string; format: TimeFormat }> {
    const [from, to] =
      args.dateRange ??
      this.opts?.defaultLookback ??
      defaultFieldMetadataDateRange();
    const columns = await this.getColumns(args);
    const ts =
      args.timestampValueExpression ||
      columns.find(c => c.name === 'Timestamp')?.name ||
      columns.find(c => c.name === 'TimeUnix')?.name ||
      columns.find(c => c.type.startsWith('DateTime64'))?.name ||
      'Timestamp';
    const column = columns.find(c => c.name === ts);
    const format: TimeFormat =
      column && columnTypeToJSType(column.type) === 'number'
        ? 'epoch_millis'
        : 'iso8601';
    return { from, to, ts, format };
  }

  private async valueCounts(
    args: Tc & { dateRange?: [Date, Date]; timestampValueExpression?: string },
    valueExpr: string,
    max: number,
  ): Promise<{ value: string; count: number }[]> {
    const { from, to, ts, format } = await this.time(args);
    const q = sampledValues(
      keyspaceOf(args),
      valueExpr,
      ts,
      format,
      from,
      to,
      this.rowSample(),
      max,
    );
    const rows = await this.rows(args, q);
    return rows.map(rowCount);
  }

  private async rows(
    args: { connectionId: string; databaseName?: string; scopeName?: string },
    query: SqlPP,
  ): Promise<unknown[]> {
    const result = await this.client.query({
      query: query.statement,
      query_params: query.parameters,
      connectionId: args.connectionId,
      format: 'JSON',
      queryContext:
        args.databaseName != null
          ? { bucket: args.databaseName, scope: args.scopeName || 'default' }
          : undefined,
    });
    const json = await result.json<Record<string, unknown>>();
    return json.data;
  }

  private key(args: Tc, suffix: string): string {
    const ks = keyspaceOf(args);
    return `cb:${args.connectionId}:${ks.bucket}.${ks.scope}.${ks.collection}:${suffix}`;
  }
}

function keyspaceOf(args: {
  databaseName: string;
  scopeName?: string;
  tableName: string;
}): Keyspace {
  return {
    bucket: args.databaseName,
    scope: args.scopeName || 'default',
    collection: args.tableName,
  };
}

function tcFrom(config: {
  connection: string;
  from: {
    databaseName: string;
    tableName: string;
    scopeName?: string;
    connectionId?: string;
  };
}): Tc {
  return { ...config.from, connectionId: config.connection };
}

function rowCount(row: unknown): { value: string; count: number } {
  if (row == null || typeof row !== 'object' || !('value' in row)) {
    return { value: '', count: 0 };
  }
  const count = 'count' in row ? Number(row.count) : 0;
  return {
    value: String(row.value ?? ''),
    count: Number.isFinite(count) ? count : 0,
  };
}

function raw(row: unknown): unknown {
  if (
    row != null &&
    typeof row === 'object' &&
    'value' in row &&
    Object.keys(row).length === 1
  ) {
    return (row as { value: unknown }).value;
  }
  return row;
}

function mapValueExpr(column: string, key?: string): string {
  const col = `d.\`${column.replace(/`/g, '')}\``;
  if (!key) return col;
  return `${col}.\`${key.replace(/`/g, '')}\``;
}

function qualifyValue(key: string): string {
  if (key.includes('.')) {
    const [head, ...rest] = key.split('.');
    return `d.\`${head}\`.\`${rest.join('.')}\``;
  }
  return `d.\`${key}\``;
}

function quoteTimestamp(name: string): string {
  return `\`${name.replace(/`/g, '')}\``;
}

function emptyTable(args: {
  databaseName: string;
  tableName: string;
}): TableMetadata {
  return {
    database: args.databaseName,
    name: args.tableName,
    uuid: '',
    engine: 'Couchbase',
    is_temporary: 0,
    data_paths: [],
    metadata_path: '',
    metadata_modification_time: '',
    metadata_version: 0,
    create_table_query: '',
    engine_full: '',
    as_select: '',
    partition_key: '',
    sorting_key: '',
    primary_key: '',
    sampling_key: '',
    storage_policy: '',
    total_rows: '',
    total_bytes: '',
    total_bytes_uncompressed: '',
    parts: '',
    active_parts: '',
    total_marks: '',
    comment: '',
  };
}
