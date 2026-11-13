import { GROUP_ALIAS } from '@/core/histogram';
import { FIXED_TIME_BUCKET_EXPR_ALIAS } from '@/core/renderChartConfig';
import {
  convertDateRangeToGranularityString,
  getFirstTimestampValueExpression,
} from '@/core/utils';
import { histogramQuantile } from '@/couchbase/fn/quantile';
import { lag } from '@/couchbase/fn/scalar';
import { timestampFormatOf } from '@/couchbase/render/select';
import { keyspace, quoteIdent } from '@/couchbase/sqlpp';
import {
  parseGranularity,
  timeBucketExpr as cbTimeBucketExpr,
  toIso30,
} from '@/couchbase/time';
import { CouchbaseNotReadyError } from '@/dataLayer/errors';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

export type MetricSelect = {
  aggFn?: string | null;
  alias?: string;
  level?: number;
  metricName?: string;
  metricNameSql?: string;
};

export type HistInput = {
  chartConfig: BuilderChartConfigWithOptDateRange;
  select: MetricSelect;
  table: string;
  nameFilter: string;
  from: { databaseName: string; scopeName?: string; tableName: string };
};

/**
 * Series identity matching upstream cityHash64(ScopeAttributes,
 * ResourceAttributes, Attributes). Encode the same three maps so gauge
 * last_value bucketing groups the same series as ClickHouse.
 */
export function seriesKeyExpr(): string {
  return `TOSTRING(ENCODE_JSON({"scope":IFNULL(ScopeAttributes, {}), "resource":IFNULL(ResourceAttributes, {}), "attrs":IFNULL(Attributes, {})}))`;
}

export function timeBucketSql(
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
  const format = timestampFormatOf(chartConfig);
  // Bucket over the bare column (CTE rows are not aliased as d).
  return cbTimeBucketExpr(tsCol, format, gran).statement;
}

export function groupBySql(
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

export function dimSelect(
  bucket: string | undefined,
  group: string | undefined,
): string {
  const parts: string[] = [];
  if (bucket)
    parts.push(`${bucket} AS ${quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS)}`);
  if (group) parts.push(`${group} AS ${quoteIdent(GROUP_ALIAS)}`);
  return parts.length ? `${parts.join(', ')}, ` : '';
}

export function dimGroupBy(
  bucket: string | undefined,
  group: string | undefined,
): string {
  const parts: string[] = [];
  if (bucket) parts.push(quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS));
  if (group) parts.push(quoteIdent(GROUP_ALIAS));
  return parts.length ? ` GROUP BY ${parts.join(', ')}` : '';
}

export function dimProject(
  bucket: string | undefined,
  group: string | undefined,
): string {
  const parts: string[] = [];
  if (bucket) parts.push(quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS));
  if (group) parts.push(quoteIdent(GROUP_ALIAS));
  return parts.length ? `${parts.join(', ')}, ` : '';
}

/**
 * Name + date-range predicate for histogram / exp-hist source CTEs.
 * Mirrors upstream weaving `renderMetricWhere` into the CTE so the outer
 * query (which only has group/value) does not re-filter on TimeUnix.
 */
export function sourceWhereClause(
  chartConfig: BuilderChartConfigWithOptDateRange,
  nameFilter: string,
): { sql: string; params: Record<string, unknown> } {
  const parts = [`(${nameFilter})`];
  const params: Record<string, unknown> = {};
  if (chartConfig.dateRange != null) {
    const tsCol = getFirstTimestampValueExpression(
      chartConfig.timestampValueExpression || 'TimeUnix',
    );
    // Qualify with d. — source CTEs always alias the keyspace as d.
    const tsExpr = tsCol.includes('.') ? tsCol : `d.${tsCol}`;
    const format = timestampFormatOf(chartConfig);
    const startOp = chartConfig.dateRangeStartInclusive === false ? '>' : '>=';
    const endOp = chartConfig.dateRangeEndInclusive === true ? '<=' : '<';
    const from = chartConfig.dateRange[0];
    const to = chartConfig.dateRange[1];
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
  const where = sourceWhereClause(chartConfig, nameFilter);

  const sourceSql = `SELECT ${dimSelect(bucket, group)}${sk} AS AttributesHash, AggregationTemporality, TONUMBER(\`Count\`) AS current_count, ${lagCount} AS prev_count, ${delta} AS delta FROM ${ks} AS d WHERE ${where.sql}`;
  const metricsSql = `SELECT ${dimProject(bucket, group)}SUM(delta) AS ${quoteIdent(valueAlias)} FROM source${dimGroupBy(bucket, group)}`;

  return {
    with: [
      { name: 'source', sql: { sql: sourceSql, params: where.params } },
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
function translateHistogramQuantileCouchbase(
  input: HistInput & { level: number },
) {
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
  // Qualify keyspace columns with d. — the source CTE aliases the collection as d.
  const rates = `CASE WHEN d.AggregationTemporality = 1 OR ${lagCounts} IS NULL THEN d.BucketCounts WHEN ARRAY_LENGTH(ARRAY x FOR x IN ARRAY_RANGE(0, LEAST(ARRAY_LENGTH(d.BucketCounts), ARRAY_LENGTH(${lagCounts}))) WHEN TONUMBER(d.BucketCounts[x]) < TONUMBER((${lagCounts})[x]) END) > 0 THEN d.BucketCounts ELSE (ARRAY TONUMBER(d.BucketCounts[i]) - TONUMBER(IFNULL((${lagCounts})[i], 0)) FOR i IN ARRAY_RANGE(0, ARRAY_LENGTH(d.BucketCounts)) END) END`;
  const where = sourceWhereClause(chartConfig, nameFilter);

  const sourceSql = `SELECT ${dimSelect(bucket, group)}${sk} AS AttributesHash, d.ExplicitBounds AS ExplicitBounds, ${rates} AS rates FROM ${ks} AS d WHERE ${where.sql}`;
  // Alias source as s so ExplicitBounds/rates are not ambiguous under UNNEST.
  // OTel histograms have N+1 bucket counts for N explicit bounds; the last
  // bucket's upper bound is +Inf. Use a large sentinel so quantile math can
  // interpolate into that bucket (NULL breaks histogramQuantile).
  const flatSql = `SELECT ${dimProject(bucket, group)}i, IFMISSINGORNULL(s.ExplicitBounds[i], 1e12) AS bound, TONUMBER(IFNULL(s.rates[i], 0)) AS rate FROM source AS s UNNEST ARRAY_RANGE(0, ARRAY_LENGTH(s.rates)) AS i`;
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
      { name: 'source', sql: { sql: sourceSql, params: where.params } },
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
