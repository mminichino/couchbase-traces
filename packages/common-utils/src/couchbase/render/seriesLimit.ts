import {
  isRatioChartConfig,
  isUsingGranularity,
  isUsingGroupBy,
} from '@/core/chartConfig';
import { hasPositiveSeriesLimit } from '@/core/utils';
import { rewriteMapSubscripts } from '@/couchbase/mapAccess';
import { type SqlPP, sqlpp } from '@/couchbase/sqlpp';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

import { groupByClauseExpr, groupByItems } from './groupBy';
import { ratioExprCouchbase } from './ratio';

/**
 * Top-N series CTE per Phase 7 §5.5 — mirrors upstream: per-(group, bucket)
 * aggregate, then max per group, keep top N.
 */
export async function renderSeriesLimitCteCouchbase(
  chartConfig: BuilderChartConfigWithOptDateRange,
  _metadata: unknown,
  parts: { from: SqlPP; where?: SqlPP; groupBy?: SqlPP },
): Promise<{ cte: SqlPP; predicate: SqlPP } | undefined> {
  const { seriesLimit } = chartConfig;
  if (
    !hasPositiveSeriesLimit(seriesLimit) ||
    !isUsingGroupBy(chartConfig) ||
    !isUsingGranularity(chartConfig) ||
    chartConfig.selectGroupBy === false ||
    !chartConfig.from?.databaseName ||
    !chartConfig.from?.tableName ||
    !Array.isArray(chartConfig.select) ||
    chartConfig.select.length === 0 ||
    parts.groupBy == null
  ) {
    return undefined;
  }

  const groupExprs = groupByItems(chartConfig).map(
    item => groupByClauseExpr(item).statement,
  );
  if (groupExprs.length === 0) return undefined;

  const groupTuple = `[${groupExprs.join(', ')}]`;

  let rankExpr: SqlPP;
  if (isRatioChartConfig(chartConfig.select, chartConfig)) {
    const [a, b] = chartConfig.select;
    const num = sqlpp`${{ Raw: `SUM(TONUMBER(${rewriteMapSubscripts(a.valueExpression || '1')}))` }}`;
    const den = sqlpp`${{ Raw: `SUM(TONUMBER(${rewriteMapSubscripts(b.valueExpression || '1')}))` }}`;
    rankExpr = ratioExprCouchbase(num, den);
  } else {
    const first = chartConfig.select[0];
    const fn = first.aggFn ?? 'count';
    rankExpr =
      fn === 'count'
        ? sqlpp`COUNT(*)`
        : sqlpp`${{ Raw: `SUM(TONUMBER(${rewriteMapSubscripts(first.valueExpression || '1')}))` }}`;
  }

  const whereSql = parts.where?.statement
    ? sqlpp` WHERE ${parts.where}`
    : sqlpp``;

  // Inner: per-(group, time-bucket) rank. Outer: max rank per group, top N.
  // parts.groupBy already includes the time-bucket expression.
  const cte = sqlpp`top_groups AS (SELECT g FROM (SELECT ${{ Raw: groupTuple }} AS g, (${rankExpr}) AS series_rank ${parts.from}${whereSql} GROUP BY ${parts.groupBy}) AS ranked GROUP BY g ORDER BY MAX(series_rank) DESC, g LIMIT ${{ Param: seriesLimit }})`;
  const predicate = sqlpp`${{ Raw: groupTuple }} IN (SELECT RAW g FROM top_groups)`;
  return { cte, predicate };
}
