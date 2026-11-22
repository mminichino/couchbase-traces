import { FIXED_TIME_BUCKET_EXPR_ALIAS } from '@/core/chartConfig';
import { GROUP_ALIAS } from '@/core/histogram';
import { CouchbaseUnsupportedError } from '@/couchbase/errors';
import { anyValue, argMax, lag } from '@/couchbase/fn/scalar';
import { resolveGranularityInterval } from '@/couchbase/render/granularity';
import { rewriteSqlInValueLists } from '@/couchbase/sqlInLists';
import { keyspace, quoteIdent } from '@/couchbase/sqlpp';
import type { BuilderChartConfigWithOptDateRange } from '@/types';
import { MetricsDataType } from '@/types';

import { translateExponentialHistogramCouchbase } from './expHistogram';
import {
  seriesKeyExpr,
  sourceWhereClause,
  timeBucketSql,
  translateHistogramCouchbase,
} from './histogram';

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
 * Gauge and sum always bucket their CTE (granularity || 'auto', as upstream
 * renderChartConfig does). 'auto' is sized here, while dateRange is known.
 */
function withResolvedGranularity(
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
function outerGranularity(
  chartConfig: BuilderChartConfigWithOptDateRange,
): BuilderChartConfigWithOptDateRange['granularity'] {
  return asInterval(resolveGranularityInterval(chartConfig));
}

function asInterval(
  interval: string | undefined,
): BuilderChartConfigWithOptDateRange['granularity'] {
  return interval as BuilderChartConfigWithOptDateRange['granularity'];
}

function asMetricsDataType(
  value: string | undefined,
): MetricsDataType | undefined {
  if (value == null) return undefined;
  for (const candidate of Object.values(MetricsDataType)) {
    if (candidate === value) return candidate;
  }
  return undefined;
}

/** Drop metric identity fields after CTE rewrite so the outer select is plain. */
function clearMetricIdentity<T extends object>(
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
const BUCKETED_COLUMNS = [
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
const SUM_BUCKETED_COLUMNS = [
  ...BUCKETED_COLUMNS,
  'AggregationTemporality',
  'IsMonotonic',
];

/** The Source → Bucketed CTE pair every non-histogram metric reads from. */
function sourceAndBucketed(
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

function bucketedColumns(columns: readonly string[]): string {
  return columns.map(c => `, ${anyValue(c)} AS ${c}`).join('');
}

/**
 * Translate a metric chart config into a builder config with SQL++ CTEs.
 * Gauge: last Value per (series, bucket) then the requested agg.
 * Sum: per-point Rate via LAG (reset → clamp at 0), then SUM Rate per bucket.
 * Histogram (explicit bounds): count / quantile CTEs (see histogram.ts).
 * Exponential histogram: count / quantile CTEs (see expHistogram.ts).
 */
export async function translateMetricChartConfigCouchbase(
  chartConfig: BuilderChartConfigWithOptDateRange,
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
    const where = sourceWhereClause(chartConfig, nameFilter);
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
    const where = sourceWhereClause(chartConfig, nameFilter);
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
        clearMetricIdentity(select[0], {
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
      granularity: outerGranularity(chartConfig),
      timestampValueExpression: timeBucketCol,
      dateRange: undefined,
    };
  }

  if (metricType === MetricsDataType.Histogram) {
    const translated = translateHistogramCouchbase({
      chartConfig,
      select: first,
      table,
      nameFilter,
      from,
    });
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
      groupBy: undefined,
      // Date range is applied inside the source CTE (see sourceWhereClause).
      // Non-timeseries queries have no time column on `metrics` to re-filter.
      dateRange: translated.hasBucket ? chartConfig.dateRange : undefined,
      granularity: undefined,
      timestampValueExpression: translated.hasBucket
        ? quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS)
        : chartConfig.timestampValueExpression,
      orderBy: translated.hasGroup ? undefined : chartConfig.orderBy,
    };
  }

  if (metricType === MetricsDataType.ExponentialHistogram) {
    const translated = translateExponentialHistogramCouchbase({
      chartConfig,
      select: first,
      table,
      nameFilter,
      from,
    });
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
      groupBy: undefined,
      dateRange: translated.hasBucket ? chartConfig.dateRange : undefined,
      granularity: undefined,
      timestampValueExpression: translated.hasBucket
        ? quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS)
        : chartConfig.timestampValueExpression,
      orderBy: translated.hasGroup ? undefined : chartConfig.orderBy,
    };
  }

  throw new CouchbaseUnsupportedError(`metrics: ${metricType}`);
}
