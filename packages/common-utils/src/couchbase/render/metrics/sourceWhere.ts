import { getFirstTimestampValueExpression } from '@/core/utils';
import { resolveGranularityInterval } from '@/couchbase/render/granularity';
import { timestampFormatOf } from '@/couchbase/render/select';
import {
  bucketStart,
  parseGranularity,
  shiftByIntervals,
  toIso30,
} from '@/couchbase/time';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

/**
 * The range a metric source CTE scans. With `warmUp` and a chart granularity
 * (upstream's `includedDataInterval`: the granularity, 'auto' sized from the
 * range), it is one interval either side of the requested range's buckets:
 * [bucket(start) - I, bucket(end) + I]. Cumulative series then have a
 * predecessor for the first visible bucket; the outer query keeps the
 * requested range on the time bucket so the padded buckets are dropped (D23).
 * Without a granularity (non-timeseries) the requested range is scanned.
 */
export function sourceDateRange(
  chartConfig: BuilderChartConfigWithOptDateRange,
  warmUp: boolean,
): [Date, Date] | undefined {
  const range = chartConfig.dateRange;
  if (range == null) return undefined;
  const interval = warmUp ? resolveGranularityInterval(chartConfig) : null;
  if (!interval) return [range[0], range[1]];
  const g = parseGranularity(interval);
  return [
    shiftByIntervals(bucketStart(range[0], g), g, -1),
    shiftByIntervals(bucketStart(range[1], g), g, 1),
  ];
}

/**
 * Name + date-range predicate for metric source CTEs. Mirrors upstream
 * weaving `renderMetricWhere` into the CTE so the outer query (which only
 * has group/value) does not re-filter on TimeUnix. `warmUp` is set for Sum,
 * Histogram, and Exponential Histogram, as upstream; Gauge reads the
 * requested range only.
 */
export function sourceWhereClause(
  chartConfig: BuilderChartConfigWithOptDateRange,
  nameFilter: string,
  opts: { warmUp?: boolean } = {},
): { sql: string; params: Record<string, unknown> } {
  const parts = [`(${nameFilter})`];
  const params: Record<string, unknown> = {};
  const range = sourceDateRange(chartConfig, opts.warmUp === true);
  if (range != null) {
    const tsCol = getFirstTimestampValueExpression(
      chartConfig.timestampValueExpression || 'TimeUnix',
    );
    // Qualify with d. — source CTEs always alias the keyspace as d.
    const tsExpr = tsCol.includes('.') ? tsCol : `d.${tsCol}`;
    const format = timestampFormatOf(chartConfig);
    const startOp = chartConfig.dateRangeStartInclusive === false ? '>' : '>=';
    const endOp = chartConfig.dateRangeEndInclusive === true ? '<=' : '<';
    const [from, to] = range;
    if (format === 'epoch_millis') {
      params.p0 = from.getTime();
      params.p1 = to.getTime();
    } else {
      params.p0 = toIso30(from);
      params.p1 = toIso30(to);
    }
    parts.push(`${tsExpr} ${startOp} $p0`);
    parts.push(`${tsExpr} ${endOp} $p1`);
  }
  return { sql: parts.join(' AND '), params };
}
