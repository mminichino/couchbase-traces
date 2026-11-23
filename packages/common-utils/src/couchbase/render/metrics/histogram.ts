import { FIXED_TIME_BUCKET_EXPR_ALIAS } from '@/core/chartConfig';
import { GROUP_ALIAS } from '@/core/histogram';
import { getFirstTimestampValueExpression } from '@/core/utils';
import { CouchbaseUnsupportedError } from '@/couchbase/errors';
import { histogramQuantile } from '@/couchbase/fn/quantile';
import { lag } from '@/couchbase/fn/scalar';
import { resolveGranularityInterval } from '@/couchbase/render/granularity';
import { groupByItems } from '@/couchbase/render/groupBy';
import { timestampFormatOf } from '@/couchbase/render/select';
import { keyspace, quoteIdent, type SqlPP } from '@/couchbase/sqlpp';
import {
  parseGranularity,
  timeBucketExpr as cbTimeBucketExpr,
} from '@/couchbase/time';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

import { sourceWhereClause } from './sourceWhere';

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
  /** The chart's where / filters / aggConditions (D24); see sourceWhere. */
  predicate?: SqlPP;
};

/**
 * Series identity matching upstream cityHash64(ScopeAttributes,
 * ResourceAttributes, Attributes). Encode the same three maps so gauge
 * last_value bucketing groups the same series as legacy store.
 */
export function seriesKeyExpr(): string {
  return `TOSTRING(ENCODE_JSON({"scope":IFNULL(ScopeAttributes, {}), "resource":IFNULL(ResourceAttributes, {}), "attrs":IFNULL(Attributes, {})}))`;
}

/**
 * Window partition for one series, as expressions: a window clause cannot
 * see the select's own aliases (an alias there reads as MISSING, so every
 * series would share one partition). Upstream partitions by the group, the
 * attributes hash, and the temporality (plus the bounds hash for histogram
 * counts, the metric name for exponential-histogram counts). Read through
 * the keyspace alias `d`.
 */
export function seriesPartition(group: string | undefined, ...extra: string[]) {
  return [group, seriesKeyExpr(), 'd.AggregationTemporality', ...extra]
    .filter(Boolean)
    .join(', ');
}

export function timeBucketSql(
  chartConfig: BuilderChartConfigWithOptDateRange,
): string | undefined {
  const tsCol = getFirstTimestampValueExpression(
    chartConfig.timestampValueExpression || 'TimeUnix',
  );
  const interval = resolveGranularityInterval(chartConfig);
  if (interval == null) return undefined;
  const gran = parseGranularity(interval);
  const format = timestampFormatOf(chartConfig);
  // Bucket over the bare column (CTE rows are not aliased as d).
  return cbTimeBucketExpr(tsCol, format, gran).statement;
}

export function groupBySql(
  chartConfig: BuilderChartConfigWithOptDateRange,
): string | undefined {
  const parts = groupByItems(chartConfig).map(item => item.expr);
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
 * `dimProject` read through `from` (`s.\`group\` AS \`group\``). Required
 * whenever the FROM clause has an UNNEST: with two FROM terms SQL++ rejects
 * a bare column as an ambiguous reference.
 */
export function dimProjectFrom(
  from: string,
  bucket: string | undefined,
  group: string | undefined,
): string {
  const parts: string[] = [];
  for (const [on, name] of [
    [bucket, FIXED_TIME_BUCKET_EXPR_ALIAS],
    [group, GROUP_ALIAS],
  ] as const) {
    if (on) parts.push(`${from}.${quoteIdent(name)} AS ${quoteIdent(name)}`);
  }
  return parts.length ? `${parts.join(', ')}, ` : '';
}

/**
 * Keyspace and output dimensions every histogram translator starts from.
 */
export function histSourceParts(input: {
  chartConfig: BuilderChartConfigWithOptDateRange;
  select: MetricSelect;
  table: string;
  from: HistInput['from'];
}) {
  const { chartConfig, select, table, from } = input;
  return {
    ks: keyspace({
      bucket: from.databaseName,
      scope: from.scopeName || 'default',
      collection: table,
    }),
    bucket: timeBucketSql(chartConfig),
    group: groupBySql(chartConfig),
    valueAlias: select.alias?.trim() || 'Value',
    sk: seriesKeyExpr(),
  };
}

/**
 * Explicit-bounds histogram count: per-series Count deltas (reset → current),
 * then SUM(delta) per output dimension.
 */
function translateHistogramCountCouchbase(input: HistInput) {
  const { chartConfig, nameFilter } = input;
  const { ks, bucket, group, valueAlias, sk } = histSourceParts(input);
  const lagCount = lag(
    'TONUMBER(`Count`)',
    seriesPartition(group, 'd.ExplicitBounds'),
    'TimeUnix',
  );
  const delta = `CASE WHEN AggregationTemporality = 1 THEN TONUMBER(\`Count\`) WHEN ${lagCount} IS NOT NULL THEN CASE WHEN TONUMBER(\`Count\`) < ${lagCount} THEN TONUMBER(\`Count\`) ELSE TONUMBER(\`Count\`) - ${lagCount} END ELSE 0 END`;
  const where = sourceWhereClause(chartConfig, nameFilter, {
    warmUp: true,
    predicate: input.predicate,
  });

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
  const { chartConfig, nameFilter, level } = input;
  const { ks, bucket, group, valueAlias, sk } = histSourceParts(input);
  const part = seriesPartition(group);
  const lagCounts = lag('d.BucketCounts', part, 'TimeUnix');
  const lagBounds = lag('d.ExplicitBounds', part, 'TimeUnix');
  // Upstream deltas: a cumulative series' first point is the zero baseline;
  // delta temporality, a new bucket layout or a decrease (reset) takes the
  // current counts; otherwise subtract element-wise.
  const decreased = `ARRAY_LENGTH(ARRAY x FOR x IN ARRAY_RANGE(0, LEAST(ARRAY_LENGTH(d.BucketCounts), ARRAY_LENGTH(${lagCounts}))) WHEN TONUMBER(d.BucketCounts[x]) < TONUMBER((${lagCounts})[x]) END) > 0`;
  const rates = `CASE WHEN d.AggregationTemporality = 2 AND ${lagCounts} IS NULL THEN (ARRAY 0 FOR c IN d.BucketCounts END) WHEN d.AggregationTemporality = 1 OR ${lagCounts} IS NULL OR d.ExplicitBounds != ${lagBounds} OR ${decreased} THEN d.BucketCounts ELSE (ARRAY TONUMBER(d.BucketCounts[i]) - TONUMBER(IFNULL((${lagCounts})[i], 0)) FOR i IN ARRAY_RANGE(0, ARRAY_LENGTH(d.BucketCounts)) END) END`;
  const where = sourceWhereClause(chartConfig, nameFilter, {
    warmUp: true,
    predicate: input.predicate,
  });

  const sourceSql = `SELECT ${dimSelect(bucket, group)}${sk} AS AttributesHash, d.ExplicitBounds AS ExplicitBounds, ${rates} AS rates FROM ${ks} AS d WHERE ${where.sql}`;
  // Alias source as s: under UNNEST every source column, the time bucket
  // and group included, must be read through it. OTel histograms have N+1
  // bucket counts for N explicit bounds; the last bound is +Inf, carried as
  // NULL into histogramQuantile.
  const flatSql = `SELECT ${dimProjectFrom('s', bucket, group)}i, IFMISSING(s.ExplicitBounds[i], NULL) AS bound, TONUMBER(IFNULL(s.rates[i], 0)) AS rate FROM source AS s UNNEST ARRAY_RANGE(0, ARRAY_LENGTH(s.rates)) AS i`;
  const dimKeys = [
    bucket ? quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS) : null,
    group ? quoteIdent(GROUP_ALIAS) : null,
    'i',
  ]
    .filter(Boolean)
    .join(', ');
  const aggSql = `SELECT ${dimProject(bucket, group)}i, MAX(bound) AS bound, SUM(rate) AS rate FROM flat GROUP BY ${dimKeys}`;
  // Sort [i, bound, rate] tuples: ARRAY_SORT compares objects field by
  // field in name order ("b" before "i"), so the NULL overflow bound would
  // sort first.
  const sorted = `ARRAY_SORT(ARRAY_AGG([i, bound, rate]))`;
  const boundsArr = `(ARRAY v[1] FOR v IN ${sorted} END)`;
  const countsArr = `(ARRAY v[2] FOR v IN ${sorted} END)`;
  const q = histogramQuantile(level, boundsArr, countsArr);
  const rebuildGroup = [
    bucket ? quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS) : null,
    group ? quoteIdent(GROUP_ALIAS) : null,
  ]
    .filter(Boolean)
    .join(', ');
  // Upstream `WHERE length(point) > 1 AND total > 0`: a bucket or group with
  // no observations has no row, not a NULL one. A wrapper, since HAVING
  // needs a GROUP BY and the number shape has none.
  const quantilesSql = `SELECT ${dimProject(bucket, group)}${q.statement} AS ${quoteIdent(valueAlias)}, COUNT(1) AS n, SUM(rate) AS total FROM agg${rebuildGroup ? ` GROUP BY ${rebuildGroup}` : ''}`;
  const metricsSql = `SELECT ${dimProjectFrom('m', bucket, group)}m.${quoteIdent(valueAlias)} AS ${quoteIdent(valueAlias)} FROM (${quantilesSql}) AS m WHERE m.n > 1 AND m.total > 0`;

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
      throw new CouchbaseUnsupportedError('metrics: histogram quantile level');
    }
    return translateHistogramQuantileCouchbase({
      ...input,
      level: input.select.level,
    });
  }
  throw new CouchbaseUnsupportedError(`metrics: histogram aggFn ${aggFn}`);
}
