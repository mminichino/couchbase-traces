import {
  FIXED_TIME_BUCKET_EXPR_ALIAS,
  isUsingGranularity,
} from '@/core/renderChartConfig';
import { sqlpp, type SqlPP } from '@/couchbase/sqlpp';
import type {
  BuilderChartConfigWithOptDateRange,
  SortSpecificationList,
} from '@/types';

import type { RenderFilterContext } from './where';

function mapOrderExpr(expr: string): string {
  const trimmed = expr.trim();
  if (trimmed === 'rand()') return 'RANDOM()';
  const cityHash = trimmed.match(/^cityHash64\((.+)\)$/i);
  if (cityHash) {
    return `HASHBYTES(${cityHash[1]}, {"algorithm":"crc32"})`;
  }
  return trimmed;
}

function renderSortSpecificationList(
  sortSpecificationList: SortSpecificationList,
): SqlPP[] {
  if (typeof sortSpecificationList === 'string') {
    return [sqlpp`${{ Raw: mapOrderExpr(sortSpecificationList) }}`];
  }
  return sortSpecificationList.map(sort => {
    const dir = sort.ordering === 'DESC' ? 'DESC' : 'ASC';
    return sqlpp`${{ Raw: mapOrderExpr(sort.valueExpression) }} ${{ Raw: dir }}`;
  });
}

export function renderOrderByCouchbase(
  chartConfig: BuilderChartConfigWithOptDateRange,
  ctx?: RenderFilterContext,
): SqlPP | undefined {
  const isIncludingTimeBucket = isUsingGranularity(chartConfig);
  if (chartConfig.orderBy == null && !isIncludingTimeBucket) {
    return undefined;
  }
  const parts: SqlPP[] = [];
  if (isIncludingTimeBucket) {
    const bucket = ctx?.timeBucket;
    // Spec §5.5: order by the bucket expression, not the select alias.
    if (bucket) {
      parts.push(bucket.expr);
    } else {
      parts.push(sqlpp`${{ Identifier: FIXED_TIME_BUCKET_EXPR_ALIAS }}`);
    }
  }
  if (chartConfig.orderBy != null) {
    parts.push(...renderSortSpecificationList(chartConfig.orderBy));
  }
  if (parts.length === 0) return undefined;
  return parts.slice(1).reduce((acc, p) => sqlpp`${acc}, ${p}`, parts[0]);
}
