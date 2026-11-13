import { GROUP_ALIAS } from '@/core/histogram';
import { FIXED_TIME_BUCKET_EXPR_ALIAS } from '@/core/renderChartConfig';
import {
  convertDateRangeToGranularityString,
  getFirstTimestampValueExpression,
} from '@/core/utils';
import { histogramQuantile } from '@/couchbase/fn/quantile';
import { lag } from '@/couchbase/fn/scalar';
import { keyspace, quoteIdent } from '@/couchbase/sqlpp';
import {
  parseGranularity,
  timeBucketExpr as cbTimeBucketExpr,
} from '@/couchbase/time';
import { CouchbaseNotReadyError } from '@/dataLayer/errors';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

type MetricSelect = {
  aggFn?: string | null;
  alias?: string;
  level?: number;
  metricName?: string;
  metricNameSql?: string;
};

type HistInput = {
  chartConfig: BuilderChartConfigWithOptDateRange;
  select: MetricSelect;
  table: string;
  nameFilter: string;
  from: { databaseName: string; scopeName?: string; tableName: string };
};

function seriesKeyExpr(): string {
  return `TOSTRING(ENCODE_JSON(IFNULL(Attributes, {})))`;
}

function timeBucketSql(
  chartConfig: BuilderChartConfigWithOptDateRange,
): string | undefined {
  if (chartConfig.granularity == null) return undefined;
  const tsCol = getFirstTimestampValueExpression(
    chartConfig.timestampValueExpression || 'TimeUnix',
  );
  const interval =
    chartConfig.granularity === 'auto' && chartConfig.dateRange
      ? convertDateRangeToGranularityString(
          chartConfig.dateRange,
          undefined,
          chartConfig.minGranularitySeconds,
        )
      : chartConfig.granularity;
  const gran = parseGranularity(String(interval));
  const format =
    (chartConfig as { timestampFormat?: string }).timestampFormat ===
    'epoch_millis'
      ? 'epoch_millis'
      : 'iso8601';
  // Bucket over the bare column (CTE rows are not aliased as d).
  return cbTimeBucketExpr(tsCol, format, gran).statement;
}

function groupBySql(
  chartConfig: BuilderChartConfigWithOptDateRange,
): string | undefined {
  if (!chartConfig.groupBy) return undefined;
  if (typeof chartConfig.groupBy === 'string') {
    const parts = chartConfig.groupBy
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return undefined;
    return `[${parts.join(', ')}]`;
  }
  const parts = chartConfig.groupBy
    .map(c => c.valueExpression?.trim())
    .filter((x): x is string => !!x);
  if (parts.length === 0) return undefined;
  return `[${parts.join(', ')}]`;
}

function dimSelect(bucket: string | undefined, group: string | undefined): string {
  const parts: string[] = [];
  if (bucket) parts.push(`${bucket} AS ${quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS)}`);
  if (group) parts.push(`${group} AS ${quoteIdent(GROUP_ALIAS)}`);
  return parts.length ? `${parts.join(', ')}, ` : '';
}

function dimGroupBy(bucket: string | undefined, group: string | undefined): string {
  const parts: string[] = [];
  if (bucket) parts.push(quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS));
  if (group) parts.push(quoteIdent(GROUP_ALIAS));
  return parts.length ? ` GROUP BY ${parts.join(', ')}` : '';
}

function dimProject(bucket: string | undefined, group: string | undefined): string {
  const parts: string[] = [];
  if (bucket) parts.push(quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS));
  if (group) parts.push(quoteIdent(GROUP_ALIAS));
  return parts.length ? `${parts.join(', ')}, ` : '';
}

/**
 * Explicit-bounds histogram count: per-series Count deltas (reset → current),
 * then SUM(delta) per output dimension.
 */
function translateHistogramCountCouchbase(input: HistInput) {
  const { chartConfig, select, table, nameFilter, from } = input;
  const ks = keyspace({
    bucket: from.databaseName,
    scope: from.scopeName || 'default',
    collection: table,
  });
  const bucket = timeBucketSql(chartConfig);
  const group = groupBySql(chartConfig);
  const valueAlias = select.alias?.trim() || 'Value';
  const sk = seriesKeyExpr();
  const lagCount = lag(
    'TONUMBER(`Count`)',
    'AttributesHash, AggregationTemporality',
    'TimeUnix',
  );
  const delta = `CASE WHEN AggregationTemporality = 1 THEN TONUMBER(\`Count\`) WHEN ${lagCount} IS NOT NULL THEN CASE WHEN TONUMBER(\`Count\`) < ${lagCount} THEN TONUMBER(\`Count\`) ELSE TONUMBER(\`Count\`) - ${lagCount} END ELSE 0 END`;

  const sourceSql = `SELECT ${dimSelect(bucket, group)}${sk} AS AttributesHash, AggregationTemporality, TONUMBER(\`Count\`) AS current_count, ${lagCount} AS prev_count, ${delta} AS delta FROM ${ks} AS d WHERE (${nameFilter})`;
  const metricsSql = `SELECT ${dimProject(bucket, group)}SUM(delta) AS ${quoteIdent(valueAlias)} FROM source${dimGroupBy(bucket, group)}`;

  return {
    with: [
      { name: 'source', sql: { sql: sourceSql, params: {} } },
      { name: 'metrics', sql: { sql: metricsSql, params: {} } },
    ],
    valueAlias,
    hasBucket: !!bucket,
    hasGroup: !!group,
  };
}

/**
 * Explicit-bounds histogram quantile: UNNEST bucket deltas, SUM per index,
 * rebuild arrays, then Phase 6 histogramQuantile.
 */
function translateHistogramQuantileCouchbase(input: HistInput & { level: number }) {
  const { chartConfig, select, table, nameFilter, from, level } = input;
  const ks = keyspace({
    bucket: from.databaseName,
    scope: from.scopeName || 'default',
    collection: table,
  });
  const bucket = timeBucketSql(chartConfig);
  const group = groupBySql(chartConfig);
  const valueAlias = select.alias?.trim() || 'Value';
  const sk = seriesKeyExpr();
  const lagCounts = lag(
    'BucketCounts',
    'AttributesHash, AggregationTemporality',
    'TimeUnix',
  );
  // Delta temporality or reset / first point → use current counts; else element-wise subtract.
  const rates = `CASE WHEN AggregationTemporality = 1 OR ${lagCounts} IS NULL THEN BucketCounts WHEN ARRAY_LENGTH(ARRAY x FOR x IN ARRAY_RANGE(0, LEAST(ARRAY_LENGTH(BucketCounts), ARRAY_LENGTH(${lagCounts}))) WHEN TONUMBER(BucketCounts[x]) < TONUMBER((${lagCounts})[x]) END) > 0 THEN BucketCounts ELSE (ARRAY TONUMBER(BucketCounts[i]) - TONUMBER(IFNULL((${lagCounts})[i], 0)) FOR i IN ARRAY_RANGE(0, ARRAY_LENGTH(BucketCounts)) END) END`;

  const sourceSql = `SELECT ${dimSelect(bucket, group)}${sk} AS AttributesHash, ExplicitBounds, ${rates} AS rates FROM ${ks} AS d WHERE (${nameFilter})`;
  const flatSql = `SELECT ${dimProject(bucket, group)}i, IFMISSINGORNULL(ExplicitBounds[i], NULL) AS bound, TONUMBER(IFNULL(rates[i], 0)) AS rate FROM source UNNEST ARRAY_RANGE(0, ARRAY_LENGTH(rates)) AS i`;
  const dimKeys = [
    bucket ? quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS) : null,
    group ? quoteIdent(GROUP_ALIAS) : null,
    'i',
  ]
    .filter(Boolean)
    .join(', ');
  const aggSql = `SELECT ${dimProject(bucket, group)}i, MAX(bound) AS bound, SUM(rate) AS rate FROM flat GROUP BY ${dimKeys}`;
  const sorted = `ARRAY_SORT(ARRAY_AGG({"i": i, "b": bound, "c": rate}))`;
  const boundsArr = `(ARRAY v.b FOR v IN ${sorted} END)`;
  const countsArr = `(ARRAY v.c FOR v IN ${sorted} END)`;
  const q = histogramQuantile(level, boundsArr, countsArr);
  const rebuildGroup = [
    bucket ? quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS) : null,
    group ? quoteIdent(GROUP_ALIAS) : null,
  ]
    .filter(Boolean)
    .join(', ');
  const metricsSql = `SELECT ${dimProject(bucket, group)}${q.statement} AS ${quoteIdent(valueAlias)} FROM agg${rebuildGroup ? ` GROUP BY ${rebuildGroup}` : ''}`;

  return {
    with: [
      { name: 'source', sql: { sql: sourceSql, params: {} } },
      { name: 'flat', sql: { sql: flatSql, params: {} } },
      { name: 'agg', sql: { sql: aggSql, params: {} } },
      {
        name: 'metrics',
        sql: { sql: metricsSql, params: { ...q.parameters } },
      },
    ],
    valueAlias,
    hasBucket: !!bucket,
    hasGroup: !!group,
  };
}

export function translateHistogramCouchbase(input: HistInput): {
  with: NonNullable<BuilderChartConfigWithOptDateRange['with']>;
  valueAlias: string;
  hasBucket: boolean;
  hasGroup: boolean;
} {
  const aggFn = input.select.aggFn;
  if (aggFn === 'count') {
    return translateHistogramCountCouchbase(input);
  }
  if (aggFn === 'quantile') {
    if (input.select.level == null) {
      throw new CouchbaseNotReadyError('metrics: histogram quantile level');
    }
    return translateHistogramQuantileCouchbase({
      ...input,
      level: input.select.level,
    });
  }
  throw new CouchbaseNotReadyError(`metrics: histogram aggFn ${aggFn}`);
}
