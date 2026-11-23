import { getFirstTimestampValueExpression } from '@/core/utils';
import { resolveGranularityInterval } from '@/couchbase/render/granularity';
import { couchbaseMetadataRef } from '@/couchbase/render/metadata';
import { timestampFormatOf } from '@/couchbase/render/select';
import { renderWhereCouchbase } from '@/couchbase/render/where';
import { type SqlPP, sqlpp } from '@/couchbase/sqlpp';
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
 * The chart's own predicate for a metric source: `where` (SQL unless the
 * chart says Lucene, as upstream's `whereLanguage ?? 'sql'`), `filters`,
 * and select aggConditions, rendered against the metric collection. Mirrors
 * upstream `renderMetricWhere`, which puts all three in the source CTE so
 * series and scale choices only see matching points (D24). The date range
 * is left to `sourceWhereClause`, which may widen it.
 */
export async function metricPredicate(
  chartConfig: BuilderChartConfigWithOptDateRange,
  from: BuilderChartConfigWithOptDateRange['from'],
  metadata: unknown,
): Promise<SqlPP | undefined> {
  const rendered = await renderWhereCouchbase(
    {
      ...chartConfig,
      from,
      dateRange: undefined,
      whereLanguage: chartConfig.whereLanguage ?? 'sql',
    },
    { metadata: couchbaseMetadataRef(metadata) },
  );
  return rendered?.statement.trim() ? rendered : undefined;
}

/**
 * Name, date range, and chart predicate for a metric source CTE. Mirrors
 * upstream weaving `renderMetricWhere` into the CTE so the outer query
 * (which only has group/value) does not re-filter. `warmUp` is set for Sum,
 * Histogram, and Exponential Histogram, as upstream; Gauge reads the
 * requested range only. Built through `sqlpp` so the predicate's
 * parameters are renumbered after the range's.
 */
export function sourceWhereClause(
  chartConfig: BuilderChartConfigWithOptDateRange,
  nameFilter: string,
  opts: { warmUp?: boolean; predicate?: SqlPP } = {},
): { sql: string; params: Record<string, unknown> } {
  let clause = sqlpp`(${{ Raw: nameFilter }})`;
  const range = sourceDateRange(chartConfig, opts.warmUp === true);
  if (range != null) {
    const tsCol = getFirstTimestampValueExpression(
      chartConfig.timestampValueExpression || 'TimeUnix',
    );
    // Qualify with d. — source CTEs always alias the keyspace as d.
    const tsExpr = tsCol.includes('.') ? tsCol : `d.${tsCol}`;
    const epoch = timestampFormatOf(chartConfig) === 'epoch_millis';
    const bound = (d: Date) => (epoch ? d.getTime() : toIso30(d));
    const startOp = chartConfig.dateRangeStartInclusive === false ? '>' : '>=';
    const endOp = chartConfig.dateRangeEndInclusive === true ? '<=' : '<';
    clause = sqlpp`${clause} AND ${{ Raw: `${tsExpr} ${startOp}` }} ${{ Param: bound(range[0]) }} AND ${{ Raw: `${tsExpr} ${endOp}` }} ${{ Param: bound(range[1]) }}`;
  }
  // renderWhereCouchbase already parenthesizes each part.
  if (opts.predicate) clause = sqlpp`${clause} AND ${opts.predicate}`;
  return { sql: clause.statement, params: clause.parameters };
}
