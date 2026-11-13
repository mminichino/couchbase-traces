import { type SqlPP, sqlpp } from '@/couchbase/sqlpp';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

export function renderLimitCouchbase(
  chartConfig: BuilderChartConfigWithOptDateRange,
): SqlPP | undefined {
  if (chartConfig.limit == null || chartConfig.limit.limit == null) {
    return undefined;
  }
  const { limit, offset } = chartConfig.limit;
  if (offset != null) {
    return sqlpp`LIMIT ${{ Param: limit }} OFFSET ${{ Param: offset }}`;
  }
  return sqlpp`LIMIT ${{ Param: limit }}`;
}
