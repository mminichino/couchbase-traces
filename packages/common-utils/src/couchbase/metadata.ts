import { isNonEmptyWhereExpr } from '@/core/chartConfig';
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
import { type FilterState, filterStateToPredicate } from '@/filters';
import { columnTypeToJSType, JSDataType } from '@/query/columnTypes';
import type { ColumnMeta } from '@/query/types';
import type { Filter, UseTextIndex } from '@/types';

import { isAccessDeniedError, isEmptyInferError } from './errors';
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
import { renderWhereCouchbase } from './render/where';
import { quoteIdent, type SqlPP, sqlpp } from './sqlpp';
import type { TimeFormat } from './time';
import type { DataClient, Keyspace } from './types';

/** How long an empty column list (empty or unreadable collection) is cached. */
export const EMPTY_COLUMNS_CACHE_TTL_MS = 10_000;

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
    const key = this.key(args, 'columns');
    let fetched = false;
    const columns = await this.cache.getOrFetch(
      key,
      async () => {
        fetched = true;
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
    // An empty collection may be filling up; keep "no columns" briefly so its
    // first documents show up without waiting out the full column TTL.
    if (fetched && columns.length === 0) {
      this.cache.set(key, columns, EMPTY_COLUMNS_CACHE_TTL_MS);
    }
    return columns;
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
      where?: string;
      whereLanguage?: 'sql' | 'lucene';
      filters?: Filter[];
      filtersLogicalOperator?: 'AND' | 'OR';
      implicitColumnExpression?: string;
      bodyExpression?: string;
      useTextIndexForImplicitColumn?: UseTextIndex;
    };
    keys: string[];
    /** Per-key faceted constraints; see upstream Metadata.getKeyValues. */
    keyConditions?: (FilterState | undefined)[];
    limit?: number;
    /** When true, skip the recent-row sample cap and scan the full range. */
    disableRowLimit?: boolean;
    signal?: AbortSignal;
    source?: unknown;
  }): Promise<KeyValues[]> {
    const tc = tcFrom(args.chartConfig);
    const baseWhere = await this.userWhere(args.chartConfig);
    const out: KeyValues[] = [];
    for (const [i, key] of args.keys.entries()) {
      const facet = args.keyConditions?.at(i);
      const facetPred =
        facet != null
          ? filterStateToPredicate(facet, k => qualifyValue(k))
          : undefined;
      let extraWhere = baseWhere;
      if (facetPred) {
        const facetSql = sqlpp`${{ Raw: facetPred }}`;
        extraWhere =
          extraWhere != null
            ? sqlpp`(${extraWhere}) AND (${facetSql})`
            : facetSql;
      }
      const values = await this.valueCounts(
        {
          ...tc,
          dateRange: args.chartConfig.dateRange,
          timestampValueExpression: args.chartConfig.timestampValueExpression,
        },
        qualifyValue(key),
        args.limit ?? 20,
        extraWhere,
        args.disableRowLimit === true,
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
      'otel_sessions',
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
        sessions: has('otel_sessions') ? 'otel_sessions' : undefined,
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
      const fields = parseInfer(rows.map(raw));
      if (fields.length > 0) return fields;
    } catch (err) {
      // An empty collection (7014) has no schema yet: not an error, as with
      // upstream DESCRIBE TABLE on an empty table.
      if (!isEmptyInferError(err)) {
        if (!isAccessDeniedError(err)) throw err;
        console.warn('INFER failed for permissions', err);
      }
    }
    // INFER can return nothing (empty collection, denied, or documents written
    // after it sampled). Fall back to field names from a few real documents so
    // ad hoc key pickers still work; an empty collection yields no fields.
    return this.inferFieldsFromSample(args);
  }

  private async inferFieldsFromSample(args: Tc): Promise<InferredField[]> {
    const ks = keyspaceOf(args);
    const q = sqlpp`SELECT d FROM ${{ Keyspace: ks }} AS d LIMIT ${{ Param: 5 }}`;
    try {
      const rows = await this.rows(args, q);
      const props = new Map<string, { type: string; samples: unknown[] }>();
      for (const row of rows) {
        const doc = sampleDoc(row);
        if (doc == null) continue;
        for (const [name, value] of Object.entries(doc)) {
          if (name.startsWith('_')) continue;
          const type =
            typeof value === 'number'
              ? 'number'
              : typeof value === 'boolean'
                ? 'boolean'
                : Array.isArray(value)
                  ? 'array'
                  : value != null && typeof value === 'object'
                    ? 'object'
                    : 'string';
          const existing = props.get(name);
          if (existing == null) {
            props.set(name, { type, samples: [value] });
          } else if (existing.samples.length < 3) {
            existing.samples.push(value);
          }
        }
      }
      if (props.size === 0) return [];
      return parseInfer([{ properties: Object.fromEntries(props.entries()) }]);
    } catch (err) {
      if (isAccessDeniedError(err)) {
        console.warn('Sample infer failed for permissions', err);
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

  /**
   * Compile chartConfig.where / filters without the time range (sampledValues
   * already applies the date window). Used so filter-variable and ad hoc
   * suggestion queries honor `$__filter` / Lucene / SQL dropdown clauses.
   */
  private async userWhere(chartConfig: {
    connection: string;
    from: {
      databaseName: string;
      tableName: string;
      scopeName?: string;
    };
    timestampValueExpression?: string;
    where?: string;
    whereLanguage?: 'sql' | 'lucene';
    filters?: Filter[];
    filtersLogicalOperator?: 'AND' | 'OR';
    implicitColumnExpression?: string;
    bodyExpression?: string;
    useTextIndexForImplicitColumn?: UseTextIndex;
  }): Promise<SqlPP | undefined> {
    const hasWhere = isNonEmptyWhereExpr(chartConfig.where);
    const hasFilters = (chartConfig.filters?.length ?? 0) > 0;
    if (!hasWhere && !hasFilters) return undefined;
    const whereText = chartConfig.where ?? '';
    // Unexpanded macros cannot be applied as SQL++ predicates.
    if (
      hasWhere &&
      /\$__(?:filter|conditionalAll|filters|sourceTable)\b/.test(whereText)
    ) {
      return undefined;
    }
    // Lucene empty-variable rendering (`ServiceName:("")`) is a match-all; the
    // SQL++ search builder would otherwise return no rows for dropdown lists.
    if (
      hasWhere &&
      chartConfig.whereLanguage === 'lucene' &&
      /:\(\s*""\s*\)/.test(whereText)
    ) {
      return undefined;
    }
    // Omit dateRange so renderWhereCouchbase does not duplicate the time
    // predicate already applied inside sampledValues.
    const rendered = await renderWhereCouchbase(
      {
        connection: chartConfig.connection,
        from: chartConfig.from,
        select: '',
        where: chartConfig.where ?? '',
        whereLanguage: chartConfig.whereLanguage,
        filters: chartConfig.filters,
        filtersLogicalOperator: chartConfig.filtersLogicalOperator,
        timestampValueExpression:
          chartConfig.timestampValueExpression ?? 'Timestamp',
        implicitColumnExpression: chartConfig.implicitColumnExpression,
        bodyExpression: chartConfig.bodyExpression,
        useTextIndexForImplicitColumn:
          chartConfig.useTextIndexForImplicitColumn,
      },
      { metadata: this },
    );
    if (rendered == null) return undefined;
    // Empty $__filter expansions become `(1=1 /** … */)`; treat as no-op so
    // unconstrained dropdowns still list every value.
    const normalized = rendered.statement
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\s+/g, '');
    if (normalized === '' || /^\(+1=1\)+$/.test(normalized)) {
      return undefined;
    }
    return rendered;
  }

  private async valueCounts(
    args: Tc & { dateRange?: [Date, Date]; timestampValueExpression?: string },
    valueExpr: string,
    max: number,
    extraWhere?: SqlPP,
    disableRowLimit = false,
  ): Promise<{ value: string; count: number }[]> {
    const { from, to, ts, format } = await this.time(args);
    const q = sampledValues(
      keyspaceOf(args),
      valueExpr,
      ts,
      format,
      from,
      to,
      disableRowLimit ? 0 : this.rowSample(),
      max,
      extraWhere,
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

/** Unwrap `SELECT d FROM … AS d` rows into the document object. */
function sampleDoc(row: unknown): Record<string, unknown> | null {
  if (row == null || typeof row !== 'object' || Array.isArray(row)) {
    return null;
  }
  const record: object = row;
  if (
    'd' in record &&
    record.d != null &&
    typeof record.d === 'object' &&
    !Array.isArray(record.d)
  ) {
    return { ...record.d };
  }
  return { ...record };
}

function mapValueExpr(column: string, key?: string): string {
  const col = `d.\`${column.replace(/`/g, '')}\``;
  if (!key) return col;
  return `${col}.\`${key.replace(/`/g, '')}\``;
}

/** `Map['k']` or `` Map.`k` `` keys: column, then one field under it. */
const MAP_SUBSCRIPT_KEY = /^([A-Za-z_][\w]*)\[\s*'((?:[^'\\]|\\.|'')*)'\s*\]$/;

/**
 * A dropdown key as a value expression. Keys come in three forms: a column
 * (`ServiceName`), a map key in ClickHouse form
 * (`ResourceAttributes['k8s.pod.name']`, Kubernetes filters), or a
 * dot-joined map key (`ResourceAttributes.service.name`) whose rest is one
 * field. Splitting the subscript form on dots used to quote it as
 * `` `ResourceAttributes['k8s`.`pod.name']` `` and read nothing.
 */
function qualifyValue(key: string): string {
  const sub = MAP_SUBSCRIPT_KEY.exec(key.trim());
  if (sub) {
    const field = sub[2].replace(/''|\\(.)/g, (m, ch: string) => ch ?? "'");
    return `d.${quoteIdent(sub[1])}.${quoteIdent(field)}`;
  }
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
