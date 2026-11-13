import { timeBucketExpr } from '@/couchbase/time';

export { timeBucketExpr };
export * from './fn/quantile';
export * from './fn/scalar';

export type Mapping = {
  clickhouse: string;
  sqlpp: string;
  builder: string;
  notes: string;
};

/** Documented SQL++ for each ClickHouse construct Phase 7 renders. */
export const MAPPINGS: readonly Mapping[] = [
  { clickhouse: 'count()', sqlpp: 'COUNT(*)', builder: 'count', notes: '' },
  { clickhouse: 'count(x)', sqlpp: 'COUNT(x)', builder: 'countOf', notes: '' },
  {
    clickhouse: 'countIf',
    sqlpp: 'COUNT(CASE WHEN c THEN 1 END)',
    builder: 'countIf',
    notes: '',
  },
  {
    clickhouse: 'sumIf',
    sqlpp: 'IFNULL(SUM(CASE WHEN c THEN x END), 0)',
    builder: 'sumIf',
    notes: '',
  },
  {
    clickhouse: 'avgIf',
    sqlpp: 'AVG(CASE WHEN c THEN x END)',
    builder: 'aggIf',
    notes: 'AVG',
  },
  {
    clickhouse: 'minIf',
    sqlpp: 'MIN(CASE WHEN c THEN x END)',
    builder: 'aggIf',
    notes: 'MIN',
  },
  {
    clickhouse: 'maxIf',
    sqlpp: 'MAX(CASE WHEN c THEN x END)',
    builder: 'aggIf',
    notes: 'MAX',
  },
  {
    clickhouse: 'uniq',
    sqlpp: 'COUNT(DISTINCT x)',
    builder: 'uniq',
    notes: '',
  },
  {
    clickhouse: 'uniqExact',
    sqlpp: 'COUNT(DISTINCT x)',
    builder: 'uniq',
    notes: 'exact',
  },
  {
    clickhouse: 'quantile',
    sqlpp: 'linear interpolation over ARRAY_SORT(ARRAY_AGG(...))',
    builder: 'quantile',
    notes: 'exact; 1% tolerance vs approximate quantile',
  },
  {
    clickhouse: 'quantileIf',
    sqlpp: 'quantile with a CASE condition',
    builder: 'quantile',
    notes: '',
  },
  {
    clickhouse: 'quantiles',
    sqlpp: 'one quantile expression per level',
    builder: 'quantile',
    notes: '',
  },
  {
    clickhouse: 'quantileTDigestWeighted',
    sqlpp: 'exact linear interpolation',
    builder: 'quantile',
    notes: 'ClickHouse t-digest is approximate',
  },
  {
    clickhouse: 'quantileTDigestWeightedIf',
    sqlpp: 'exact linear interpolation',
    builder: 'quantile',
    notes: '',
  },
  {
    clickhouse: 'argMax',
    sqlpp: 'MAX([t, x])[1]',
    builder: 'argMax',
    notes: '',
  },
  {
    clickhouse: 'argMin',
    sqlpp: 'MIN([t, x])[1]',
    builder: 'argMin',
    notes: '',
  },
  {
    clickhouse: 'any',
    sqlpp: 'MIN(x)',
    builder: 'anyValue',
    notes: 'deterministic stand-in for an arbitrary value',
  },
  {
    clickhouse: 'toStartOfInterval',
    sqlpp: 'MILLIS_TO_UTC(FLOOR(millis / bucket) * bucket, format)',
    builder: 'timeBucketExpr',
    notes: 'week and month use DATE_TRUNC_MILLIS',
  },
  {
    clickhouse: 'toStartOfFifteenMinutes',
    sqlpp: 'MILLIS_TO_UTC(FLOOR(millis / bucket) * bucket, format)',
    builder: 'timeBucketExpr',
    notes: '15 minute bucket',
  },
  {
    clickhouse: 'toUnixTimestamp',
    sqlpp: 'FLOOR(millis / 1000)',
    builder: 'toUnixSeconds',
    notes: '',
  },
  {
    clickhouse: 'toUnixTimestamp64Milli',
    sqlpp: 'millis',
    builder: 'toUnixMillis',
    notes: '',
  },
  {
    clickhouse: 'fromUnixTimestamp64Milli',
    sqlpp: 'MILLIS_TO_UTC(millis, format)',
    builder: 'timeBucketExpr',
    notes: 'format a millisecond instant',
  },
  {
    clickhouse: 'now',
    sqlpp: `NOW_UTC("${'1111-11-11T11:11:11.111Z'}")`,
    builder: 'nowIso',
    notes: '',
  },
  {
    clickhouse: 'arrayJoin',
    sqlpp: 'UNNEST arr AS alias',
    builder: 'unnest',
    notes: 'FROM clause',
  },
  {
    clickhouse: 'ARRAY JOIN',
    sqlpp: 'UNNEST arr AS alias',
    builder: 'unnest',
    notes: 'FROM clause',
  },
  {
    clickhouse: 'has',
    sqlpp: 'ARRAY_CONTAINS(arr, v)',
    builder: 'has',
    notes: '',
  },
  {
    clickhouse: 'hasAny',
    sqlpp: 'ANY x IN a SATISFIES x IN b END',
    builder: 'hasAny',
    notes: '',
  },
  {
    clickhouse: 'hasAll',
    sqlpp: 'EVERY x IN b SATISFIES x IN a END',
    builder: 'hasAll',
    notes: '',
  },
  {
    clickhouse: 'length',
    sqlpp: 'ARRAY_LENGTH(arr)',
    builder: 'arrayLength',
    notes: 'strings use LENGTH',
  },
  {
    clickhouse: 'empty',
    sqlpp: 'IFNULL(ARRAY_LENGTH(arr), 0) = 0',
    builder: 'isEmpty',
    notes: '',
  },
  {
    clickhouse: 'notEmpty',
    sqlpp: 'IFNULL(ARRAY_LENGTH(arr), 0) > 0',
    builder: 'isNotEmpty',
    notes: '',
  },
  {
    clickhouse: 'mapContains',
    sqlpp: 'ANY k IN OBJECT_NAMES(m) SATISFIES k = $p0 END',
    builder: 'mapContains',
    notes: '',
  },
  {
    clickhouse: 'mapKeys',
    sqlpp: 'OBJECT_NAMES(m)',
    builder: 'mapKeys',
    notes: '',
  },
  {
    clickhouse: 'JSONExtract',
    sqlpp: 'quoted path, TONUMBER when numeric',
    builder: 'jsonPath',
    notes: '',
  },
  {
    clickhouse: 'JSONExtractString',
    sqlpp: 'quoted path',
    builder: 'jsonPath',
    notes: '',
  },
  {
    clickhouse: 'hasToken',
    sqlpp: 'SEARCH(...) or REGEXP_CONTAINS',
    builder: 'hasToken',
    notes: 'Search index when the field is covered',
  },
  {
    clickhouse: 'positionCaseInsensitive',
    sqlpp: 'CONTAINS(LOWER(x), LOWER($p0))',
    builder: 'containsCI',
    notes: '',
  },
  {
    clickhouse: 'match',
    sqlpp: 'REGEXP_CONTAINS(x, $p0)',
    builder: 'regexMatch',
    notes: '',
  },
  { clickhouse: 'lower', sqlpp: 'LOWER(x)', builder: 'lower', notes: '' },
  { clickhouse: 'upper', sqlpp: 'UPPER(x)', builder: 'upper', notes: '' },
  { clickhouse: 'concat', sqlpp: 'CONCAT(a, b)', builder: 'concat', notes: '' },
  { clickhouse: 'round', sqlpp: 'ROUND(x)', builder: 'round', notes: '' },
  { clickhouse: 'floor', sqlpp: 'FLOOR(x)', builder: 'floor', notes: '' },
  { clickhouse: 'abs', sqlpp: 'ABS(x)', builder: 'abs', notes: '' },
  {
    clickhouse: 'toString',
    sqlpp: 'TOSTRING(x)',
    builder: 'toString',
    notes: '',
  },
  {
    clickhouse: 'toFloat64',
    sqlpp: 'TONUMBER(x)',
    builder: 'toNumber',
    notes: '',
  },
  {
    clickhouse: 'toInt64',
    sqlpp: 'TRUNC(TONUMBER(x))',
    builder: 'toInt',
    notes: '',
  },
  {
    clickhouse: 'if',
    sqlpp: 'CASE WHEN c THEN a ELSE b END',
    builder: 'ifThen',
    notes: '',
  },
  {
    clickhouse: 'IF',
    sqlpp: 'CASE WHEN c THEN a ELSE b END',
    builder: 'ifThen',
    notes: '',
  },
  {
    clickhouse: 'If',
    sqlpp: 'CASE WHEN c THEN a ELSE b END',
    builder: 'ifThen',
    notes: 'conditional suffix',
  },
  {
    clickhouse: 'multiIf',
    sqlpp: 'CASE WHEN c1 THEN a1 ELSE b END',
    builder: 'multiIf',
    notes: '',
  },
  { clickhouse: 'intDiv', sqlpp: 'IDIV(a, b)', builder: 'intDiv', notes: '' },
  {
    clickhouse: 'CAST',
    sqlpp: 'TONUMBER, TOSTRING, or TOBOOLEAN',
    builder: 'cast',
    notes: 'other targets are unsupported',
  },
  {
    clickhouse: '::',
    sqlpp: 'TONUMBER, TOSTRING, or TOBOOLEAN',
    builder: 'cast',
    notes: 'cast operator',
  },
  {
    clickhouse: 'groupArray',
    sqlpp: 'ARRAY_AGG(x)',
    builder: 'groupArray',
    notes: '',
  },
  {
    clickhouse: 'groupUniqArray',
    sqlpp: 'ARRAY_AGG(DISTINCT x)',
    builder: 'groupUniqArray',
    notes: '',
  },
  {
    clickhouse: 'topk',
    sqlpp:
      'SELECT x AS `val`, COUNT(*) AS `c` GROUP BY x ORDER BY `c` DESC LIMIT $p0',
    builder: 'topK',
    notes: 'caller correlates the subquery',
  },
  {
    clickhouse: 'lagInFrame',
    sqlpp: 'LAG(x) OVER (PARTITION BY p ORDER BY o)',
    builder: 'lag',
    notes: '',
  },
  {
    clickhouse: 'histogram_quantile',
    sqlpp: 'cumulative bucket interpolation',
    builder: 'histogramQuantile',
    notes: 'same arithmetic as core/histogram.ts',
  },
  {
    clickhouse: 'PREWHERE',
    sqlpp: '(dropped)',
    builder: 'none',
    notes: 'Dropped by the renderer',
  },
  {
    clickhouse: 'FINAL',
    sqlpp: '(dropped)',
    builder: 'none',
    notes: 'Dropped by the renderer',
  },
  {
    clickhouse: 'SAMPLE',
    sqlpp: '(dropped)',
    builder: 'none',
    notes: 'Dropped by the renderer',
  },
  {
    clickhouse: 'SETTINGS',
    sqlpp: '(dropped)',
    builder: 'none',
    notes: 'Dropped by the renderer',
  },
  {
    clickhouse: 'FORMAT',
    sqlpp: '(dropped)',
    builder: 'none',
    notes: 'Dropped by the renderer',
  },
  {
    clickhouse: '{name:Type}',
    sqlpp: '$name',
    builder: 'sqlpp',
    notes: 'named parameter',
  },
];

const DROPPED = new Set([
  'PREWHERE',
  'FINAL',
  'SAMPLE',
  'SETTINGS',
  'FORMAT',
  '->',
]);

/** Reason a catalog construct is not given its own builder. */
export function unsupportedReason(name: string, category: string): string {
  if (MAPPINGS.some(row => row.clickhouse === name)) return '';
  if (category === 'setting')
    return 'ClickHouse setting; the renderer drops SETTINGS';
  if (category === 'type')
    return 'ClickHouse type name; column types come from INFER';
  if (category === 'parameter_type')
    return 'ClickHouse parameter type; SQL++ uses named parameters';
  if (category === 'clause' && DROPPED.has(name))
    return 'Dropped by the renderer';
  if (category === 'clause')
    return 'No SQL++ clause with the same shape in this phase';
  if (category === 'dynamic_suffix')
    return 'Combinator is expressed as CASE WHEN or ARRAY_CONTAINS';
  return 'No SQL++ equivalent in this phase; catalog token or ClickHouse-only function';
}

export function renderMappingsMarkdown(
  extra: { clickhouse: string; reason: string }[],
): string {
  const header = [
    '# SQL++ mapping',
    '',
    'Generated from `MAPPINGS` in `packages/common-utils/src/couchbase/functions.ts`.',
    '',
    '| ClickHouse | SQL++ | Builder | Notes |',
    '|---|---|---|---|',
  ];
  const rows = MAPPINGS.map(
    row =>
      `| \`${row.clickhouse.replace(/\|/g, '\\|')}\` | ${row.sqlpp.replace(/\|/g, '\\|')} | \`${row.builder}\` | ${row.notes} |`,
  );
  const unsupported = [
    '',
    '## Not supported',
    '',
    '| Construct | Reason |',
    '|---|---|',
    ...extra.map(
      row => `| \`${row.clickhouse.replace(/\|/g, '\\|')}\` | ${row.reason} |`,
    ),
    '',
  ];
  return [...header, ...rows, ...unsupported].join('\n');
}
