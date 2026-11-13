import type { ChartConfigWithOptDateRangeEx } from '@/core/renderChartConfig';
import { CouchbaseNotReadyError } from '@/dataLayer/errors';
import { isBuilderChartConfig } from '@/guards';
import type { QuerySettings } from '@/types';

import type { SerializerMetadata } from './serializer';
import { CouchbaseSearchBuilder } from './serializer';
import { type SqlPP, sqlpp } from './sqlpp';
import { type TimeFormat, timeRangePredicate } from './time';

export type SqlppQuery = {
  sql: string;
  params: Record<string, unknown>;
  dialect: 'sqlpp';
};

/**
 * Shared statement skeleton. Aggregations, group by, and raw SQL are filled
 * in per slice in Phase 7.
 */
export async function renderChartConfigCouchbase(
  config: ChartConfigWithOptDateRangeEx,
  _metadata: unknown,
  _querySettings: QuerySettings | undefined,
): Promise<SqlppQuery> {
  const dateRange =
    'dateRange' in config && Array.isArray(config.dateRange)
      ? (config.dateRange as [Date, Date])
      : undefined;
  const inclusiveEnd =
    'dateRangeEndInclusive' in config && config.dateRangeEndInclusive === true;
  if (!isBuilderChartConfig(config)) {
    const kind = 'configType' in config ? String(config.configType) : 'chart';
    throw new CouchbaseNotReadyError(`charts: ${kind}`);
  }
  assertSkeleton(config);
  const from = config.from;
  const scope = from.scopeName || 'default';
  const alias = 'd';
  const ts = config.timestampValueExpression || 'Timestamp';
  const format: TimeFormat =
    'timestampFormat' in config && config.timestampFormat === 'epoch_millis'
      ? 'epoch_millis'
      : 'iso8601';
  const parts: SqlPP[] = [];
  if (dateRange) {
    parts.push(
      timeRangePredicate(
        `${alias}.\`${ts.replace(/`/g, '')}\``,
        format,
        dateRange[0],
        dateRange[1],
        { inclusiveEnd },
      ),
    );
  }
  const where = await compileFilter(
    config.where,
    config.whereLanguage,
    config,
    alias,
    scope,
    _metadata,
  );
  if (where.statement.trim()) parts.push(where);
  for (const filter of config.filters ?? []) {
    if (filter.type === 'sql_ast') {
      throw new CouchbaseNotReadyError('charts: filters.sql_ast');
    }
    const compiled = await compileFilter(
      filter.condition,
      filter.type,
      config,
      alias,
      scope,
      _metadata,
    );
    if (compiled.statement.trim()) parts.push(compiled);
  }
  const whereSql = parts.length > 0 ? sqlpp` WHERE ${joinAnd(parts)}` : sqlpp``;
  const limit = config.limit?.limit;
  const offset = config.limit?.offset;
  const page =
    limit != null
      ? sqlpp` LIMIT ${{ Param: limit }}${offset != null ? sqlpp` OFFSET ${{ Param: offset }}` : sqlpp``}`
      : sqlpp``;
  const statement = sqlpp`SELECT ${{ Raw: alias }}.* FROM ${{ Keyspace: { bucket: from.databaseName, scope, collection: from.tableName } }} AS ${{ Raw: alias }}${whereSql}${page}`;
  return {
    sql: statement.statement,
    params: statement.parameters,
    dialect: 'sqlpp',
  };
}

function assertSkeleton(
  config: Extract<
    ChartConfigWithOptDateRangeEx,
    { from: unknown; select: unknown }
  >,
): void {
  const select = config.select;
  const bare =
    select == null ||
    select === '' ||
    select === '*' ||
    (typeof select === 'string' && select.trim() === '*');
  if (!bare) throw new CouchbaseNotReadyError('charts: select');
  if (config.groupBy) throw new CouchbaseNotReadyError('charts: groupBy');
  if (config.orderBy) throw new CouchbaseNotReadyError('charts: orderBy');
  if (config.having) throw new CouchbaseNotReadyError('charts: having');
  if (config.with && config.with.length > 0) {
    throw new CouchbaseNotReadyError('charts: with');
  }
  if (config.granularity)
    throw new CouchbaseNotReadyError('charts: granularity');
  if (config.formulas && config.formulas.length > 0) {
    throw new CouchbaseNotReadyError('charts: formulas');
  }
}

async function compileFilter(
  condition: string | undefined,
  language: string | undefined,
  config: Extract<
    ChartConfigWithOptDateRangeEx,
    {
      connection: string;
      from: { databaseName: string; tableName: string; scopeName?: string };
    }
  >,
  alias: string,
  scope: string,
  metadataRef: unknown = undefined,
): Promise<SqlPP> {
  if (!condition?.trim()) return sqlpp``;
  if (language === 'promql') throw new CouchbaseNotReadyError('charts: promql');
  if (language === 'sql') return sqlpp`(${{ Raw: condition }})`;
  const metadata = columnSource(metadataRef);
  const built = await new CouchbaseSearchBuilder(condition, {
    metadata,
    tc: {
      connectionId: config.connection,
      databaseName: config.from.databaseName,
      scopeName: scope,
      tableName: config.from.tableName,
    },
    alias,
    implicitColumnExpression: config.implicitColumnExpression,
    bodyExpression: config.bodyExpression,
    searchIndexName:
      'searchIndexName' in config
        ? String(config.searchIndexName ?? '')
        : undefined,
  }).build();
  return built;
}

function columnSource(metadata: unknown): SerializerMetadata {
  if (
    metadata != null &&
    typeof metadata === 'object' &&
    'getColumns' in metadata &&
    typeof metadata.getColumns === 'function'
  ) {
    const read = metadata.getColumns.bind(metadata);
    return {
      async getColumns(args) {
        const columns: unknown = await read(args);
        if (!Array.isArray(columns)) return [];
        const out: { name: string; type: string }[] = [];
        for (const column of columns) {
          if (column == null || typeof column !== 'object') continue;
          if (!('name' in column) || typeof column.name !== 'string') continue;
          const type =
            'type' in column && typeof column.type === 'string'
              ? column.type
              : '';
          out.push({ name: column.name, type });
        }
        return out;
      },
    };
  }
  return {
    async getColumns() {
      return [];
    },
  };
}

function joinAnd(parts: SqlPP[]): SqlPP {
  return parts
    .slice(1)
    .reduce((acc, part) => sqlpp`${acc} AND ${part}`, parts[0]);
}
