import { FIXED_TIME_BUCKET_EXPR_ALIAS } from '@/core/chartConfig';
import { GROUP_ALIAS } from '@/core/histogram';
import { CouchbaseUnsupportedError } from '@/couchbase/errors';
import { lag } from '@/couchbase/fn/scalar';
import { quoteIdent } from '@/couchbase/sqlpp';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

import {
  dimGroupBy,
  dimProject,
  dimProjectFrom,
  dimSelect,
  type HistInput,
  histSourceParts,
  seriesPartition,
  sourceWhereClause,
} from './histogram';

export type SqlppWithClauses = {
  with: NonNullable<BuilderChartConfigWithOptDateRange['with']>;
  valueAlias: string;
  hasBucket: boolean;
  hasGroup: boolean;
};

type ExpHistogramInput = HistInput;
type ExpHistogramQuantileInput = HistInput & { level: number };

/**
 * Quantile window partition over a CTE that already carries `group` and
 * `series_key` as columns, so the names resolve (unlike in the select that
 * defines them; see seriesPartition).
 */
function partitionKeys(group: string | undefined, extra: string): string {
  return [
    group ? quoteIdent(GROUP_ALIAS) : null,
    'MetricName',
    'series_key',
    extra || null,
  ]
    .filter(Boolean)
    .join(', ');
}

function normalizeSideSql(offsetCol: string, countsCol: string) {
  const s = `(Scale - min_scale[0])`;
  const d = `POWER(2, ${s})`;
  const o = offsetCol;
  const n = `ARRAY_LENGTH(${countsCol})`;
  const newOff = `FLOOR(${o} / ${d})`;
  const len = `FLOOR((${o} + ${n} - 1) / ${d}) - FLOOR(${o} / ${d}) + 1`;
  const counts = `CASE WHEN ${s} = 0 OR ${n} = 0 THEN IFNULL(${countsCol}, []) ELSE ARRAY ARRAY_SUM(IFNULL(${countsCol}[GREATEST(0, (${newOff} + j) * ${d} - ${o}) : LEAST(${n}, (${newOff} + j + 1) * ${d} - ${o})], [])) FOR j IN ARRAY_RANGE(0, ${len}) END END`;
  return {
    offset: `CASE WHEN ${n} = 0 THEN ${o} ELSE ${newOff} END`,
    counts,
  };
}

/**
 * Exponential histogram count / quantile CTEs for Couchbase (Phase 7a).
 * Mirrors upstream translateExponentialHistogram with SQL++ replacements for
 * bitShift*, arraySplit, and sumMap.
 */
export function translateExponentialHistogramCouchbase(
  input: ExpHistogramInput,
): SqlppWithClauses {
  const aggFn = input.select.aggFn;
  if (aggFn === 'count') {
    return expHistogramCount(input);
  }
  if (aggFn === 'quantile') {
    if (input.select.level == null) {
      throw new CouchbaseUnsupportedError(
        'metrics: exponential histogram quantile level',
      );
    }
    return expHistogramQuantile({ ...input, level: input.select.level });
  }
  throw new Error(
    `${aggFn} is not currently supported for exponential histogram metrics`,
  );
}

function expHistogramCount(input: ExpHistogramInput): SqlppWithClauses {
  const { chartConfig, nameFilter } = input;
  const { ks, bucket, group, valueAlias, sk } = histSourceParts(input);
  // Expressions, not this select's `group` / `series_key` aliases (D22).
  const part = seriesPartition(group, 'd.MetricName');
  const lagCount = lag('TONUMBER(`Count`)', part, 'TimeUnix');
  const lagStart = lag('StartTimeUnix', part, 'TimeUnix');
  const lagTime = lag('TimeUnix', part, 'TimeUnix');
  const delta = `CASE WHEN AggregationTemporality = 1 THEN TONUMBER(\`Count\`) WHEN AggregationTemporality = 2 THEN CASE WHEN ${lagTime} IS NOT VALUED OR StartTimeUnix = TimeUnix THEN 0 WHEN StartTimeUnix != ${lagStart} OR TONUMBER(\`Count\`) < ${lagCount} THEN TONUMBER(\`Count\`) ELSE TONUMBER(\`Count\`) - ${lagCount} END ELSE 0 END`;
  const where = sourceWhereClause(chartConfig, nameFilter);

  const sourceSql = `SELECT ${dimSelect(bucket, group)}MetricName, ${sk} AS series_key, AggregationTemporality, TimeUnix, StartTimeUnix, TONUMBER(\`Count\`) AS current_count, ${delta} AS delta FROM ${ks} AS d WHERE ${where.sql}`;
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

function expHistogramQuantile(
  input: ExpHistogramQuantileInput,
): SqlppWithClauses {
  const { chartConfig, nameFilter, level } = input;
  const { ks, bucket, group, valueAlias, sk } = histSourceParts(input);
  const dimIn = dimSelect(bucket, group);
  const dimOut = dimProject(bucket, group);
  const part = partitionKeys(group, '');

  const where = sourceWhereClause(chartConfig, nameFilter);
  const filteredSql = `SELECT ${dimIn}MetricName, TimeUnix, StartTimeUnix, AggregationTemporality, Scale, ${sk} AS series_key, TONUMBER(ZeroCount) AS ZeroCount, PositiveOffset, IFNULL(PositiveBucketCounts, []) AS PositiveBucketCounts, NegativeOffset, IFNULL(NegativeBucketCounts, []) AS NegativeBucketCounts FROM ${ks} AS d WHERE ${where.sql}`;

  const posN = normalizeSideSql('PositiveOffset', 'PositiveBucketCounts');
  const negN = normalizeSideSql('NegativeOffset', 'NegativeBucketCounts');
  const minScaleSql = `SELECT RAW MIN(Scale) FROM filtered_series`;
  const normalizedSql = `SELECT ${dimOut}MetricName, TimeUnix, StartTimeUnix, AggregationTemporality, min_scale[0] AS Scale, series_key, ZeroCount, ${posN.offset} AS PositiveOffset, ${posN.counts} AS PositiveBucketCounts, ${negN.offset} AS NegativeOffset, ${negN.counts} AS NegativeBucketCounts FROM filtered_series`;

  const lagTime = lag('TimeUnix', part, 'TimeUnix');
  const lagStart = lag('StartTimeUnix', part, 'TimeUnix');
  const lagZero = lag('ZeroCount', part, 'TimeUnix');
  const lagPo = lag('PositiveOffset', part, 'TimeUnix');
  const lagPc = lag('PositiveBucketCounts', part, 'TimeUnix');
  const lagNo = lag('NegativeOffset', part, 'TimeUnix');
  const lagNc = lag('NegativeBucketCounts', part, 'TimeUnix');

  const innerLag = `SELECT ${dimOut}MetricName, TimeUnix, StartTimeUnix, Scale, series_key, ZeroCount, PositiveOffset, PositiveBucketCounts, NegativeOffset, NegativeBucketCounts, ${lagTime} AS prev_time, ${lagStart} AS prev_start, ${lagZero} AS prev_zero, ${lagPo} AS prev_po, ${lagPc} AS prev_pc, ${lagNo} AS prev_no, ${lagNc} AS prev_nc FROM series_with_normalized_scale WHERE AggregationTemporality = 2`;

  const alignedPos = `ARRAY IFNULL(CASE WHEN PositiveOffset + i - IFNULL(prev_po, PositiveOffset) >= 0 AND PositiveOffset + i - IFNULL(prev_po, PositiveOffset) < ARRAY_LENGTH(IFNULL(prev_pc, [])) THEN IFNULL(prev_pc, [])[PositiveOffset + i - IFNULL(prev_po, 0)] END, 0) FOR i IN ARRAY_RANGE(0, ARRAY_LENGTH(PositiveBucketCounts)) END`;
  const alignedNeg = `ARRAY IFNULL(CASE WHEN NegativeOffset + i - IFNULL(prev_no, NegativeOffset) >= 0 AND NegativeOffset + i - IFNULL(prev_no, NegativeOffset) < ARRAY_LENGTH(IFNULL(prev_nc, [])) THEN IFNULL(prev_nc, [])[NegativeOffset + i - IFNULL(prev_no, 0)] END, 0) FOR i IN ARRAY_RANGE(0, ARRAY_LENGTH(NegativeBucketCounts)) END`;

  const mid = `SELECT x.*, ARRAY PositiveBucketCounts[i] - aligned_prev_pos[i] FOR i IN ARRAY_RANGE(0, ARRAY_LENGTH(PositiveBucketCounts)) END AS pos_deltas, ARRAY NegativeBucketCounts[i] - aligned_prev_neg[i] FOR i IN ARRAY_RANGE(0, ARRAY_LENGTH(NegativeBucketCounts)) END AS neg_deltas FROM (SELECT s.*, ${alignedPos} AS aligned_prev_pos, ${alignedNeg} AS aligned_prev_neg FROM (${innerLag}) AS s) AS x`;

  const useZero = `prev_time IS NOT VALUED OR StartTimeUnix = TimeUnix`;
  const posDec = `ANY z IN pos_deltas SATISFIES z < 0 END OR ARRAY_SUM(IFNULL(prev_pc, [])) > ARRAY_SUM(aligned_prev_pos)`;
  const negDec = `ANY z IN neg_deltas SATISFIES z < 0 END OR ARRAY_SUM(IFNULL(prev_nc, [])) > ARRAY_SUM(aligned_prev_neg)`;
  const useCurrent = `NOT (${useZero}) AND (StartTimeUnix != prev_start OR ZeroCount < prev_zero OR (${posDec}) OR (${negDec}))`;

  const zeroOut = `CASE WHEN ${useZero} THEN 0 WHEN ${useCurrent} THEN ZeroCount ELSE ZeroCount - prev_zero END`;
  const posOut = `CASE WHEN ${useZero} THEN [] ELSE ARRAY [PositiveOffset + i, CASE WHEN ${useCurrent} THEN PositiveBucketCounts[i] ELSE pos_deltas[i] END] FOR i IN ARRAY_RANGE(0, ARRAY_LENGTH(PositiveBucketCounts)) END END`;
  const negOut = `CASE WHEN ${useZero} THEN [] ELSE ARRAY [NegativeOffset + i, CASE WHEN ${useCurrent} THEN NegativeBucketCounts[i] ELSE neg_deltas[i] END] FOR i IN ARRAY_RANGE(0, ARRAY_LENGTH(NegativeBucketCounts)) END END`;

  const cumBranch = `SELECT ${dimOut}MetricName, TimeUnix, Scale, series_key, ${zeroOut} AS ZeroCount, ${posOut} AS pos, ${negOut} AS neg FROM (${mid}) AS nd`;
  const deltaBranch = `SELECT ${dimOut}MetricName, TimeUnix, Scale, series_key, ZeroCount, ARRAY [PositiveOffset + i, PositiveBucketCounts[i]] FOR i IN ARRAY_RANGE(0, ARRAY_LENGTH(PositiveBucketCounts)) END AS pos, ARRAY [NegativeOffset + i, NegativeBucketCounts[i]] FOR i IN ARRAY_RANGE(0, ARRAY_LENGTH(NegativeBucketCounts)) END AS neg FROM series_with_normalized_scale WHERE AggregationTemporality = 1`;
  const deltasSql = `${cumBranch} UNION ALL ${deltaBranch}`;

  // Qualify dim columns as nd.* — UNNEST makes bare `group` ambiguous.
  const dimFromNd = dimProjectFrom('nd', bucket, group);
  const bucketRows = `SELECT ${dimFromNd}nd.Scale AS Scale, 0 AS side, 0 AS idx, nd.ZeroCount AS c FROM normalized_deltas AS nd UNION ALL SELECT ${dimFromNd}nd.Scale AS Scale, 1 AS side, p[0] AS idx, p[1] AS c FROM normalized_deltas AS nd UNNEST nd.pos AS p UNION ALL SELECT ${dimFromNd}nd.Scale AS Scale, -1 AS side, p[0] AS idx, p[1] AS c FROM normalized_deltas AS nd UNNEST nd.neg AS p`;
  const summedInner = `SELECT ${dimOut}MIN(Scale) AS Scale, side, idx, SUM(c) AS c FROM bucket_rows GROUP BY ${[
    bucket ? quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS) : null,
    group ? quoteIdent(GROUP_ALIAS) : null,
    'side',
    'idx',
  ]
    .filter(Boolean)
    .join(', ')}`;

  const rebuildGroup = [
    bucket ? quoteIdent(FIXED_TIME_BUCKET_EXPR_ALIAS) : null,
    group ? quoteIdent(GROUP_ALIAS) : null,
  ]
    .filter(Boolean)
    .join(', ');
  const summedSql = `SELECT ${dimOut}MIN(Scale) AS Scale, IFNULL(MAX(CASE WHEN side = 0 THEN c END), 0) AS \`zero\`, ARRAY_SORT(ARRAY x FOR x IN ARRAY_AGG(CASE WHEN side = -1 THEN [idx, c] END) WHEN x IS VALUED END) AS neg_pairs, ARRAY_SORT(ARRAY x FOR x IN ARRAY_AGG(CASE WHEN side = 1 THEN [idx, c] END) WHEN x IS VALUED END) AS pos_pairs FROM summed${rebuildGroup ? ` GROUP BY ${rebuildGroup}` : ''}`;

  // Nest ordered → counts/cum → sel/rank → value so aliases are columns.
  const orderedExpr = `ARRAY_CONCAT(ARRAY_REVERSE(neg_pairs), [[0, \`zero\`]], pos_pairs)`;
  const withOrdered = `SELECT sb.*, ${orderedExpr} AS ordered FROM summed_buckets AS sb`;
  const withCounts = `SELECT o.*, ARRAY x[1] FOR x IN o.ordered END AS counts FROM (${withOrdered}) AS o`;
  const withCum = `SELECT c.*, ARRAY ARRAY_SUM(c.counts[0 : i + 1]) FOR i IN ARRAY_RANGE(0, ARRAY_LENGTH(c.counts)) END AS cum FROM (${withCounts}) AS c`;
  const withSel = `SELECT u.*, u.cum[ARRAY_LENGTH(u.cum) - 1] AS total, $p0 * u.cum[ARRAY_LENGTH(u.cum) - 1] AS rank, FIRST i FOR i IN ARRAY_RANGE(0, ARRAY_LENGTH(u.counts)) WHEN u.counts[i] > 0 AND u.cum[i] >= ($p0 * u.cum[ARRAY_LENGTH(u.cum) - 1]) END AS sel, ARRAY_LENGTH(u.neg_pairs) AS neg_len FROM (${withCum}) AS u`;
  const metricsSqlNested = `SELECT ${dimOut}CASE WHEN side < 0 THEN -POWER(2, (idx + 1 - fraction) * POWER(2, -Scale)) WHEN side > 0 THEN POWER(2, (idx + fraction) * POWER(2, -Scale)) ELSE 0 END AS ${quoteIdent(valueAlias)} FROM (SELECT ${dimOut}Scale, SIGN(sel - neg_len) AS side, ordered[sel][0] AS idx, (rank - (CASE WHEN sel = 0 THEN 0 ELSE cum[sel - 1] END)) / counts[sel] AS fraction, total, sel FROM (${withSel}) AS r WHERE total > 0 AND sel IS VALUED) AS s`;

  return {
    with: [
      {
        name: 'filtered_series',
        sql: { sql: filteredSql, params: where.params },
      },
      { name: 'min_scale', sql: { sql: minScaleSql, params: {} } },
      {
        name: 'series_with_normalized_scale',
        sql: { sql: normalizedSql, params: {} },
      },
      { name: 'normalized_deltas', sql: { sql: deltasSql, params: {} } },
      { name: 'bucket_rows', sql: { sql: bucketRows, params: {} } },
      { name: 'summed', sql: { sql: summedInner, params: {} } },
      { name: 'summed_buckets', sql: { sql: summedSql, params: {} } },
      {
        name: 'metrics',
        sql: { sql: metricsSqlNested, params: { p0: level } },
      },
    ],
    valueAlias,
    hasBucket: !!bucket,
    hasGroup: !!group,
  };
}
