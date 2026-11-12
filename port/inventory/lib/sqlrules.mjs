// Keyword, type, portable, and mapped-function tables for ClickHouse to SQL++ classification.

/** Words never treated as function calls (upper case). */
export const SQL_KEYWORDS = new Set([
  'IN', 'AND', 'OR', 'NOT', 'AS', 'ON', 'USING', 'VALUES', 'OVER', 'FILTER', 'EXISTS',
  'SELECT', 'FROM', 'WHERE', 'JOIN', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END', 'INTERVAL',
  'WITH', 'LIMIT', 'OFFSET', 'ORDER', 'GROUP', 'BY', 'HAVING', 'UNION', 'ALL', 'DISTINCT',
  'BETWEEN', 'IS', 'NULL', 'LIKE', 'ILIKE',
]);

/** Same name and meaning in SQL++ (lower case). */
export const PORTABLE = new Set([
  'count', 'sum', 'avg', 'min', 'max', 'lower', 'upper', 'abs', 'ceil', 'floor', 'round',
  'sqrt', 'power', 'exp', 'ln', 'log10', 'concat', 'trim', 'ltrim', 'rtrim', 'length',
  'coalesce', 'greatest', 'least', 'replace',
]);

/**
 * ClickHouse constructs in the plan's SQL++ mapping table, with the SQL++ approach.
 * Names starting `quantile` or `JSONExtract` map through the prefix entries below.
 * @type {Map<string, string>}
 */
export const MAPPED = new Map([
  ['toStartOfInterval', 'Bucket epoch milliseconds: FLOOR(MILLIS(ts) / interval_ms) * interval_ms, converted back with MILLIS_TO_UTC; DATE_TRUNC_STR for calendar units'],
  ['count()', 'COUNT(*)'],
  ['countIf', 'COUNT(*) FILTER (WHERE cond)'],
  ['sumIf', 'SUM(expr) FILTER (WHERE cond)'],
  ['avgIf', 'AVG(expr) FILTER (WHERE cond)'],
  ['uniq', 'COUNT(DISTINCT expr)'],
  ['uniqExact', 'COUNT(DISTINCT expr)'],
  ['quantile', 'PERCENTILE_CONT(expr, p) aggregate; MEDIAN for p = 0.5'],
  ['argMax', 'FIRST_VALUE(value) OVER (PARTITION BY group ORDER BY key DESC), or a subquery ordered by key DESC LIMIT 1'],
  ['any', 'ARRAY_AGG(expr)[0], or MIN(expr) when any value is acceptable'],
  ['arrayJoin', 'UNNEST over the array field'],
  ['ARRAY JOIN', 'UNNEST over the array field'],
  ['LEFT ARRAY JOIN', 'LEFT UNNEST over the array field'],
  ['JSONExtract', 'Field path access on the JSON document, with TONUMBER, TOSTRING, or TOBOOLEAN for typing'],
  ['ILIKE', 'LOWER(expr) LIKE LOWER(pattern); SQL++ has no ILIKE'],
  ['hasToken', 'SEARCH(field, token) over a Search index, or REGEXP_CONTAINS(field, word-boundary pattern)'],
  ['PREWHERE', 'WHERE; the query planner chooses the access path'],
  ['FINAL', 'Omit; documents are upserted by key, so there are no unmerged duplicates'],
  ['SAMPLE', 'WHERE RANDOM() < rate, or omit'],
  ['SETTINGS', 'Query options passed through the SDK (timeout, scan consistency, named parameters); drop engine-specific settings'],
  ['FORMAT', 'Omit; the SDK returns JSON rows'],
]);

/**
 * SQL++ approach for a ClickHouse name, or null when the plan has no mapping.
 * @param {string} name
 * @returns {string | null}
 */
export function mappedApproach(name) {
  const exact = MAPPED.get(name);
  if (exact !== undefined) return exact;
  if (name.startsWith('quantile')) return /** @type {string} */ (MAPPED.get('quantile'));
  if (name.startsWith('JSONExtract')) return /** @type {string} */ (MAPPED.get('JSONExtract'));
  return null;
}

/** Names used to detect SQL-bearing literals, besides MAPPED. */
export const CLICKHOUSE_FUNCTION_NAMES = new Set([
  'if', 'multiIf', 'map', 'mapKeys', 'mapValues', 'has', 'hasAny', 'hasAll', 'arrayMap',
  'arrayFilter', 'arrayExists', 'splitByChar', 'splitByNonAlpha', 'positionCaseInsensitive',
  'match', 'extract', 'lowerUTF8', 'upperUTF8', 'now', 'now64', 'today', 'dateDiff',
  'formatDateTime', 'parseDateTimeBestEffort', 'fromUnixTimestamp64Nano', 'isNull',
  'isNotNull', 'empty', 'notEmpty', 'round', 'intDiv', 'groupArray', 'groupUniqArray',
  'topK', 'histogram',
]);

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isClickhouseFunction(name) {
  if (MAPPED.has(name)) return true;
  if (CLICKHOUSE_FUNCTION_NAMES.has(name)) return true;
  if (name.startsWith('quantile') || name.startsWith('JSONExtract')) return true;
  return /^to[A-Z]/.test(name);
}

/** ClickHouse type names. */
export const TYPES = new Set([
  'String', 'FixedString', 'UUID', 'Bool',
  'Int8', 'Int16', 'Int32', 'Int64', 'Int128', 'Int256',
  'UInt8', 'UInt16', 'UInt32', 'UInt64', 'UInt128', 'UInt256',
  'Float32', 'Float64', 'Decimal', 'Decimal32', 'Decimal64', 'Decimal128',
  'Date', 'Date32', 'DateTime', 'DateTime64', 'Enum8', 'Enum16', 'LowCardinality',
  'Nullable', 'Array', 'Tuple', 'Map', 'Nested', 'JSON', 'Dynamic', 'Variant',
  'IPv4', 'IPv6', 'AggregateFunction', 'SimpleAggregateFunction',
]);

/**
 * @param {string} name
 * @returns {'portable' | 'mapped' | 'unmapped'}
 */
export function classifyFunction(name) {
  if (PORTABLE.has(name.toLowerCase())) return 'portable';
  if (mappedApproach(name) !== null) return 'mapped';
  return 'unmapped';
}

/**
 * Dynamic suffixes such as `If` are mapped when a mapped name ends with them.
 * @param {string} suffix
 * @returns {{ classification: 'mapped' | 'unmapped', approach: string | null }}
 */
export function classifySuffix(suffix) {
  for (const [name, approach] of MAPPED) {
    if (name.endsWith(suffix) && name !== suffix) {
      return { classification: 'mapped', approach };
    }
  }
  return { classification: 'unmapped', approach: null };
}

/**
 * Every literal name in the tables, for filtering plan symbol checks.
 * @returns {Set<string>}
 */
export function allRuleNames() {
  const out = new Set();
  for (const s of [SQL_KEYWORDS, PORTABLE, CLICKHOUSE_FUNCTION_NAMES, TYPES]) {
    for (const n of s) out.add(n);
  }
  for (const k of MAPPED.keys()) out.add(k);
  return out;
}
