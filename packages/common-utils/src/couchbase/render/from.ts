import { type SqlPP, sqlpp } from '@/couchbase/sqlpp';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

/** The alias every rendered builder query gives its FROM keyspace. */
export const FROM_KEYSPACE_ALIAS = 'd';
const ALIAS = FROM_KEYSPACE_ALIAS;

export function renderFromCouchbase(
  chartConfig: Pick<BuilderChartConfigWithOptDateRange, 'from'> & {
    isRenderingRawSqlTemplate?: boolean;
  },
): SqlPP {
  const from = chartConfig.from;
  // CTE / subquery alias: empty databaseName means tableName is a WITH name.
  // Keep CTE references literal even when emitting a raw-SQL template — the
  // $__sourceTable macro only stands in for a real source keyspace.
  if (!from.databaseName && from.tableName) {
    return sqlpp`FROM ${{ Identifier: from.tableName }} AS ${{ Raw: ALIAS }}`;
  }
  if (chartConfig.isRenderingRawSqlTemplate && from.databaseName) {
    return sqlpp`FROM ${{ Raw: '$__sourceTable' }} AS ${{ Raw: ALIAS }}`;
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
