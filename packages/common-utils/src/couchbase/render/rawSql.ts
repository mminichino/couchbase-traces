import type { ChartConfigWithOptDateRangeEx } from '@/core/renderChartConfig';
import { keyspace } from '@/couchbase/sqlpp';
import { CouchbaseNotReadyError } from '@/dataLayer/errors';
import { isRawSqlChartConfig } from '@/guards';
import { QUERY_PARAMS_BY_DISPLAY_TYPE } from '@/rawSqlParams';
import { DisplayType } from '@/types';

import { ensureOutermostSelectLimit } from '@/couchbase/rawSqlLimit';

import { expandMacrosCouchbase } from './macros';

export async function renderRawSqlChartConfigCouchbase(
  config: ChartConfigWithOptDateRangeEx,
  _metadata: unknown,
): Promise<{ sql: string; params: Record<string, unknown>; dialect: 'sqlpp' }> {
  if (!isRawSqlChartConfig(config)) {
    throw new CouchbaseNotReadyError('charts: rawSql');
  }
  const raw = config;
  if (typeof raw.sqlTemplate !== 'string') {
    throw new CouchbaseNotReadyError('charts: rawSql');
  }
  const displayType = raw.displayType ?? DisplayType.Table;
  const queryParams = QUERY_PARAMS_BY_DISPLAY_TYPE[displayType] ?? [];
  const paramValues = Object.fromEntries(
    queryParams.map(param => [param.name, param.get(raw)]),
  );
  const start = Number(paramValues.startDateMilliseconds ?? Date.now());
  const end = Number(paramValues.endDateMilliseconds ?? Date.now());
  const intervalSeconds = Number(paramValues.intervalSeconds ?? 60);

  const from = 'from' in raw ? raw.from : undefined;
  const sourceKeyspace =
    from != null
      ? keyspace({
          bucket: from.databaseName,
          scope: from.scopeName || 'default',
          collection: from.tableName,
        })
      : undefined;

  const expanded = expandMacrosCouchbase(raw.sqlTemplate, {
    startDateMilliseconds: start,
    endDateMilliseconds: end,
    intervalSeconds,
    timestampFormat:
      'timestampFormat' in config && config.timestampFormat === 'epoch_millis'
        ? 'epoch_millis'
        : 'iso8601',
    sourceKeyspace,
  });

  return {
    sql: ensureOutermostSelectLimit(expanded.sql),
    params: { ...paramValues, ...expanded.params },
    dialect: 'sqlpp',
  };
}
