import { CouchbaseUnsupportedError } from '@/couchbase/errors';
import { argMax, lag } from '@/couchbase/fn/scalar';
import { rewriteSqlInValueLists } from '@/couchbase/sqlInLists';
import { keyspace, quoteIdent } from '@/couchbase/sqlpp';
import type { BuilderChartConfigWithOptDateRange } from '@/types';
import { MetricsDataType } from '@/types';

import { translateExponentialHistogramCouchbase } from './expHistogram';
import {
  seriesKeyExpr,
  timeBucketSql,
  translateHistogramCouchbase,
} from './histogram';
import {
  BUCKETED_COLUMNS,
  bucketedColumns,
  clearMetricIdentity,
  histogramOuter,
  outerBucketRange,
  outerGranularity,
  sourceAndBucketed,
  SUM_BUCKETED_COLUMNS,
  withResolvedGranularity,
} from './outer';
import { metricPredicate, sourceWhereClause } from './sourceWhere';

function asMetricsDataType(
  value: string | undefined,
): MetricsDataType | undefined {
  if (value == null) return undefined;
  for (const candidate of Object.values(MetricsDataType)) {
    if (candidate === value) return candidate;
  }
  return undefined;
}

type MetricSelect = {
  metricType?: string;
  metricName?: string;
  metricNameSql?: string;
  aggFn?: string | null;
  valueExpression?: string;
  isDelta?: boolean;
  alias?: string;
  level?: number;
  aggCondition?: string;
  aggConditionLanguage?: string;
};

/**
 * Translate a metric chart config into a builder config with SQL++ CTEs.
 * Gauge: last Value per (series, bucket) then the requested agg.
 * Sum: per-point Rate via LAG (reset → clamp at 0), then SUM Rate per bucket.
 * Histogram (explicit bounds): count / quantile CTEs (see histogram.ts).
 * Exponential histogram: count / quantile CTEs (see expHistogram.ts).
 */
export async function translateMetricChartConfigCouchbase(
  chartConfig: BuilderChartConfigWithOptDateRange,
  metadata?: unknown,
): Promise<BuilderChartConfigWithOptDateRange> {
  const metricTables = chartConfig.metricTables;
  if (!metricTables) return chartConfig;
  const select = chartConfig.select;
  if (!Array.isArray(select) || select.length === 0) {
    throw new CouchbaseUnsupportedError('metrics: select shape');
  }
  if (select.length > 1) {
    throw new CouchbaseUnsupportedError('metrics: multi-select');
  }

  const first = select[0] as MetricSelect;
  const metricType = asMetricsDataType(first.metricType);
  const metricName = first.metricName;
  if (!metricType || !metricName) {
    throw new CouchbaseUnsupportedError('metrics: metricType/metricName');
  }
  const table = metricTables[metricType as keyof typeof metricTables];
  if (!table) {
    throw new CouchbaseUnsupportedError(`metrics: table for ${metricType}`);
  }

  const from = {
    ...chartConfig.from,
    tableName: table,
  };
  const ks = keyspace({
    bucket: from.databaseName,
    scope: from.scopeName || 'default',
    collection: table,
  });
  // The app's semantic-convention migration sends `MetricName IN ('a', 'b')`.
  const nameFilter = first.metricNameSql?.trim()
    ? rewriteSqlInValueLists(first.metricNameSql)
    : `MetricName = '${metricName.replace(/'/g, "''")}'`;
  // The chart's where / filters / aggConditions go in the source (D24); the
  // outer query keeps none of them (`where: ''`, `filters: undefined`).
  const predicate = await metricPredicate(chartConfig, from, metadata);

  if (
    metricType === MetricsDataType.Gauge ||
    metricType === MetricsDataType.Summary
  ) {
    // Mirror upstream: Source (+AttributesHash) → Bucketed last_value per
    // (series, time bucket) → outer agg over LastValue. Always bucket
    // (granularity || 'auto'), same as core/renderChartConfig.ts.
    const timeBucketCol = '__hdx_time_bucket2';
    const bucketedConfig = withResolvedGranularity(chartConfig);
    const bucketExpr = timeBucketSql(bucketedConfig);
    if (!bucketExpr) {
      throw new CouchbaseUnsupportedError('metrics: gauge time bucket');
    }
    const where = sourceWhereClause(chartConfig, nameFilter, { predicate });
    const seriesKey = seriesKeyExpr();
    const lastValue = argMax('TONUMBER(`Value`)', 'TimeUnix');
    const sourceSql = `SELECT d.*, ${seriesKey} AS AttributesHash FROM ${ks} AS d WHERE ${where.sql}`;
    // GROUP BY the bucket expression itself — SQL++ rejects grouping by its
    // select-list alias (error 5370).
    const bucketedSql = `SELECT ${bucketExpr} AS ${quoteIdent(timeBucketCol)}, AttributesHash, ${lastValue} AS LastValue${bucketedColumns(BUCKETED_COLUMNS)} FROM Source GROUP BY AttributesHash, ${bucketExpr}`;
    return {
      ...chartConfig,
      ...sourceAndBucketed(sourceSql, where.params, bucketedSql),
      select: [
        clearMetricIdentity(select[0], {
          valueExpression: 'LastValue',
          aggCondition: '',
        }),
      ],
      where: '',
      filters: undefined,
      // Date range already applied in Source. Keep the caller's granularity
      // (do not force 'auto') so a non-timeseries formula/agg averages
      // LastValue across buckets instead of re-bucketing — same as upstream.
      // Resolved here: with dateRange gone, 'auto' could not be sized later.
      granularity: outerGranularity(chartConfig),
      timestampValueExpression: timeBucketCol,
      dateRange: undefined,
    };
  }

  if (metricType === MetricsDataType.Sum) {
    // Mirror upstream Sum Source + Bucketed: per-point Rate (delta / reset
    // clamp), Sum cumulative, then per-(series, bucket) sum(Rate) and
    // argMax(Sum). Outer agg uses Rate when aggFn is set, else last Sum.
    const timeBucketCol = '__hdx_time_bucket2';
    const bucketedConfig = withResolvedGranularity(chartConfig);
    const bucketExpr = timeBucketSql(bucketedConfig);
    if (!bucketExpr) {
      throw new CouchbaseUnsupportedError('metrics: sum time bucket');
    }
    const seriesKey = seriesKeyExpr();
    // Timeseries sums read one interval either side (D23); see sourceWhere.
    const where = sourceWhereClause(chartConfig, nameFilter, {
      warmUp: true,
      predicate,
    });
    // Partition by the series-key expression (not the select alias) — SQL++
    // window functions cannot see sibling aliases in the same SELECT.
    const lagExpr = lag('TONUMBER(`Value`)', seriesKey, 'TimeUnix');
    // DELTA temporality (1): Value is already the increase. CUMULATIVE (2):
    // rate is greatest(delta, 0); NULL lag (first point) → NULL rate, ignored
    // by SUM — same as upstream greatest(Value - lagInFrame(...), 0).
    const rateExpr = `CASE WHEN AggregationTemporality = 1 THEN TONUMBER(\`Value\`) ELSE GREATEST(TONUMBER(\`Value\`) - ${lagExpr}, 0) END`;
    const sourceSql = `SELECT d.*, ${seriesKey} AS AttributesHash, ${rateExpr} AS Rate, TONUMBER(\`Value\`) AS Sum FROM ${ks} AS d WHERE ${where.sql}`;
    const bucketedSql = `SELECT ${bucketExpr} AS ${quoteIdent(timeBucketCol)}, AttributesHash, SUM(Rate) AS Rate, ${argMax('Sum', 'TimeUnix')} AS Sum${bucketedColumns(SUM_BUCKETED_COLUMNS)} FROM Source GROUP BY AttributesHash, ${bucketExpr}`;
    const useRate = first.aggFn != null && first.aggFn !== '';
    return {
      ...chartConfig,
      ...sourceAndBucketed(sourceSql, where.params, bucketedSql),
      select: [
        // No aggFn: the latest cumulative reading per output row, as
        // upstream's last_value(Sum). A bare `Sum` is not a group key.
        // Upstream spreads `{ alias: 'Value', ..._select }` (D25).
        clearMetricIdentity(select[0], {
          alias: first.alias?.trim() || 'Value',
          aggFn: useRate
            ? first.aggFn === 'increase'
              ? 'sum'
              : first.aggFn
            : 'last_value',
          valueExpression: useRate ? 'Rate' : 'Sum',
          aggCondition: '',
        }),
      ],
      where: '',
      filters: undefined,
      granularity: outerGranularity(chartConfig),
      timestampValueExpression: timeBucketCol,
      // A warmed-up source has padded buckets; the requested range on the
      // bucket drops them, as upstream keeps dateRange on the outer query.
      ...outerBucketRange(chartConfig, chartConfig.granularity != null),
    };
  }

  if (
    metricType === MetricsDataType.Histogram ||
    metricType === MetricsDataType.ExponentialHistogram
  ) {
    const translate =
      metricType === MetricsDataType.Histogram
        ? translateHistogramCouchbase
        : translateExponentialHistogramCouchbase;
    return histogramOuter(
      chartConfig,
      translate({
        chartConfig,
        select: first,
        table,
        nameFilter,
        from,
        predicate,
      }),
    );
  }

  throw new CouchbaseUnsupportedError(`metrics: ${metricType}`);
}
