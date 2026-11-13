import { isNonEmptyWhereExpr } from '@/core/renderChartConfig';
import type { SqlPP } from '@/couchbase/sqlpp';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

import type { RenderFilterContext } from './where';
import { compileWhereExpressionCouchbase } from './where';

export async function renderHavingCouchbase(
  chartConfig: BuilderChartConfigWithOptDateRange,
  ctx: RenderFilterContext,
): Promise<SqlPP | undefined> {
  if (!isNonEmptyWhereExpr(chartConfig.having)) {
    return undefined;
  }
  return compileWhereExpressionCouchbase({
    condition: chartConfig.having,
    language: chartConfig.havingLanguage ?? 'sql',
    chartConfig,
    ctx,
  });
}
