import { convertDateRangeToGranularityString } from '@/core/utils';
import { type Granularity, parseGranularity } from '@/couchbase/time';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

type GranularityFields = Pick<
  BuilderChartConfigWithOptDateRange,
  'granularity' | 'dateRange' | 'minGranularitySeconds'
>;

/**
 * A chart's granularity as a concrete `"<n> <unit>"` interval, with 'auto'
 * sized from the date range the way upstream `timeBucketExpr` does. Returns
 * undefined when the chart has no granularity. 'auto' with no date range
 * cannot be sized and throws.
 */
export function resolveGranularityInterval(
  chartConfig: GranularityFields,
): string | undefined {
  const { granularity, dateRange } = chartConfig;
  if (granularity == null) return undefined;
  if (granularity !== 'auto') return String(granularity);
  if (!dateRange) {
    throw new Error("granularity 'auto' needs a date range to size buckets");
  }
  return convertDateRangeToGranularityString(
    dateRange,
    undefined,
    chartConfig.minGranularitySeconds,
  );
}

/** `resolveGranularityInterval` parsed, or `fallback` when unset. */
export function resolveGranularity(
  chartConfig: GranularityFields,
  fallback: string,
): Granularity {
  return parseGranularity(resolveGranularityInterval(chartConfig) ?? fallback);
}
