import { FIXED_TIME_BUCKET_EXPR_ALIAS } from '@/core/chartConfig';
import { GROUP_ALIAS } from '@/core/histogram';
import { anyValue } from '@/couchbase/fn/scalar';
import { resolveGranularityInterval } from '@/couchbase/render/granularity';
import { quoteIdent } from '@/couchbase/sqlpp';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

import type { SqlppWithClauses } from './expHistogram';

/**
 * Outer-query helpers for translateMetricChartConfigCouchbase: granularity,
 * the Source → Bucketed CTE pair, and the outer date range and select.
 */

/**
 * Gauge and sum always bucket their CTE (granularity || 'auto', as upstream
 * renderChartConfig does). 'auto' is sized here, while dateRange is known.
 */
export function withResolvedGranularity(
  chartConfig: BuilderChartConfigWithOptDateRange,
) {
  return {
    ...chartConfig,
    granularity: asInterval(
      resolveGranularityInterval({
        ...chartConfig,
        granularity: chartConfig.granularity || 'auto',
      }),
    ),
  };
}

/** The outer query's granularity: the caller's, with 'auto' resolved. */
export function outerGranularity(
  chartConfig: BuilderChartConfigWithOptDateRange,
): BuilderChartConfigWithOptDateRange['granularity'] {
  return asInterval(resolveGranularityInterval(chartConfig));
}

function asInterval(
  interval: string | undefined,
): BuilderChartConfigWithOptDateRange['granularity'] {
  return interval as BuilderChartConfigWithOptDateRange['granularity'];
}

/** Drop metric identity fields after CTE rewrite so the outer select is plain. */
export function clearMetricIdentity<T extends object>(
  row: T,
  overrides: Record<string, unknown>,
): T {
  return {
    ...row,
    ...overrides,
    metricType: undefined,
    metricName: undefined,
    metricNameSql: undefined,
  };
}

/**
 * OTel columns the Bucketed CTEs carry through (upstream projects them with
 * any()), so a groupBy or filter on e.g. ResourceAttributes['k8s.pod.name']
 * reads the series' value instead of MISSING. Every row in an AttributesHash
 * group shares them, so MIN picks that one value.
 */
export const BUCKETED_COLUMNS = [
  'ScopeAttributes',
  'ResourceAttributes',
  'Attributes',
  'ResourceSchemaUrl',
  'ScopeName',
  'ScopeVersion',
  'ScopeDroppedAttrCount',
  'ScopeSchemaUrl',
  'ServiceName',
  'MetricName',
  'MetricDescription',
  'MetricUnit',
  'StartTimeUnix',
  'Flags',
];
export const SUM_BUCKETED_COLUMNS = [
  ...BUCKETED_COLUMNS,
  'AggregationTemporality',
  'IsMonotonic',
];

/** The Source → Bucketed CTE pair every non-histogram metric reads from. */
export function sourceAndBucketed(
  sourceSql: string,
  sourceParams: Record<string, unknown>,
  bucketedSql: string,
) {
  return {
    with: [
      { name: 'Source', sql: { sql: sourceSql, params: sourceParams } },
      { name: 'Bucketed', sql: { sql: bucketedSql, params: {} } },
    ],
    from: { databaseName: '', tableName: 'Bucketed' },
  };
}

/**
 * The outer query's date range over a CTE time bucket. Bucket aliases are
 * ISO strings whatever the source's timestamp format, so the filter binds
 * ISO bounds (an epoch_millis source would otherwise compare a string to a
 * number and match nothing).
 */
export function outerBucketRange(
  chartConfig: BuilderChartConfigWithOptDateRange,
  keep: boolean,
): Pick<BuilderChartConfigWithOptDateRange, 'dateRange'> & {
  timestampFormat?: 'iso8601';
} {
  if (!keep || chartConfig.dateRange == null) return { dateRange: undefined };
  return { dateRange: chartConfig.dateRange, timestampFormat: 'iso8601' };
}

/** The outer query over a histogram translator's `metrics` CTE. */
export function histogramOuter(
  chartConfig: BuilderChartConfigWithOptDateRange,
  translated: SqlppWithClauses,
): BuilderChartConfigWithOptDateRange {
  const selectParts = [
    translated.hasBucket ? quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS) : null,
    translated.hasGroup ? quoteIdent(GROUP_ALIAS) : null,
    quoteIdent(translated.valueAlias),
  ].filter(Boolean);
  return {
    ...chartConfig,
    with: translated.with,
    select: selectParts.join(', '),
    from: { databaseName: '', tableName: 'metrics' },
    where: '',
    filters: undefined,
    groupBy: undefined,
    // The source CTE scans the (warmed-up) range; timeseries queries drop
    // the padded buckets here. Non-timeseries queries scan only the
    // requested range and have no time column on `metrics` to re-filter.
    ...outerBucketRange(chartConfig, translated.hasBucket),
    granularity: undefined,
    timestampValueExpression: translated.hasBucket
      ? quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS)
      : chartConfig.timestampValueExpression,
    orderBy: translated.hasGroup ? undefined : chartConfig.orderBy,
  };
}

export function bucketedColumns(columns: readonly string[]): string {
  return columns.map(c => `, ${anyValue(c)} AS ${c}`).join('');
}
