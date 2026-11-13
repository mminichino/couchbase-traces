import { isUsingGranularity, isUsingGroupBy } from '@/core/renderChartConfig';
import type { BuilderChartConfigWithOptDateRange } from '@/types';
import { DisplayType } from '@/types';

/** Search list queries include document keys for row identity. */
export function includeRowIdInSelect(
  chartConfig: BuilderChartConfigWithOptDateRange,
): boolean {
  if (chartConfig.displayType === DisplayType.Search) return true;
  // Metric translates rewrite select to a CTE string; those rows have no META id.
  if (chartConfig.metricTables) return false;
  const select = chartConfig.select;
  // Pattern / delta sample queries use a string select without Search display.
  if (
    typeof select === 'string' &&
    select.trim() !== '' &&
    select.trim() !== '*' &&
    !isUsingGroupBy(chartConfig) &&
    !isUsingGranularity(chartConfig)
  ) {
    return true;
  }
  return false;
}
