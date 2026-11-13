import { type SqlPP, sqlpp } from '@/couchbase/sqlpp';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

const ALIAS = 'd';

export function renderFromCouchbase(
  chartConfig: Pick<BuilderChartConfigWithOptDateRange, 'from'>,
): SqlPP {
  const from = chartConfig.from;
  // CTE / subquery alias: empty databaseName means tableName is a WITH name.
  if (!from.databaseName && from.tableName) {
    return sqlpp`FROM ${{ Identifier: from.tableName }} AS ${{ Raw: ALIAS }}`;
  }
  if (!from.databaseName || !from.tableName) {
    return sqlpp`FROM ${{ Raw: ALIAS }}`;
  }
  const scope = from.scopeName ?? 'default';
  return sqlpp`FROM ${{ Keyspace: { bucket: from.databaseName, scope, collection: from.tableName } }} AS ${{ Raw: ALIAS }}`;
}

export function renderFromWithRowIdCouchbase(
  chartConfig: Pick<BuilderChartConfigWithOptDateRange, 'from'>,
  rowId: string,
): SqlPP {
  const base = renderFromCouchbase(chartConfig);
  return sqlpp`${base} USE KEYS ${{ Param: rowId }}`;
}
