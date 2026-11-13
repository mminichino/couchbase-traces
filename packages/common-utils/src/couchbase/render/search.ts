import { isUsingGranularity, isUsingGroupBy } from '@/core/renderChartConfig';
import type { BuilderChartConfigWithOptDateRange } from '@/types';
import { DisplayType } from '@/types';

/** Search list queries include document keys for row identity. */
export function includeRowIdInSelect(
  chartConfig: BuilderChartConfigWithOptDateRange,
): boolean {
  if (chartConfig.displayType === DisplayType.Search) return true;
  const select = chartConfig.select;
  if (
    typeof select === 'string' &&
    select.trim() !== '' &&
    select.trim() !== '*' &&
    !isUsingGroupBy(chartConfig) &&
    !isUsingGranularity(chartConfig)
  ) {
  }
  return false;
}
