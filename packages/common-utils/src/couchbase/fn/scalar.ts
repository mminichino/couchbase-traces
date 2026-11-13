import { quoteIdent, type SqlPP, sqlpp } from '@/couchbase/sqlpp';
import { SQLPP_DATE_FORMAT } from '@/couchbase/time';
import { CouchbaseUnsupportedError } from '@/dataLayer/errors';

export function count(): string {
  return 'COUNT(*)';
}

export function countOf(x: string): string {
  return `COUNT(${x})`;
}

export function countIf(c: string): string {
  return `COUNT(CASE WHEN ${c} THEN 1 END)`;
}

export function sumIf(x: string, c: string): string {
  return `IFNULL(SUM(CASE WHEN ${c} THEN ${x} END), 0)`;
}

export function aggIf(fn: 'AVG' | 'MIN' | 'MAX', x: string, c: string): string {
  return `${fn}(CASE WHEN ${c} THEN ${x} END)`;
}

export function uniq(x: string): string {
  return `COUNT(DISTINCT ${x})`;
}

export function anyValue(x: string): string {
  return `MIN(${x})`;
}

export function argMax(x: string, t: string): string {
  return `MAX([${t}, ${x}])[1]`;
}

export function argMin(x: string, t: string): string {
  return `MIN([${t}, ${x}])[1]`;
}

export function toUnixSeconds(millisExpr: string): string {
  return `FLOOR(${millisExpr} / 1000)`;
}

export function toUnixMillis(millisExpr: string): string {
  return millisExpr;
}

export function nowIso(): string {
  return `NOW_UTC("${SQLPP_DATE_FORMAT}")`;
}

export function unnest(arrExpr: string, alias: string): string {
  return `UNNEST ${arrExpr} AS ${alias}`;
}

export function has(arr: string, v: string): string {
  return `ARRAY_CONTAINS(${arr}, ${v})`;
}

export function hasAny(a: string, b: string): string {
  return `ANY x IN ${a} SATISFIES x IN ${b} END`;
}

export function hasAll(a: string, b: string): string {
  return `EVERY x IN ${b} SATISFIES x IN ${a} END`;
}

export function arrayLength(arr: string): string {
  return `ARRAY_LENGTH(${arr})`;
}

export function stringLength(s: string): string {
  return `LENGTH(${s})`;
}

export function isEmpty(arr: string): string {
  return `IFNULL(ARRAY_LENGTH(${arr}), 0) = 0`;
}

export function isNotEmpty(arr: string): string {
  return `IFNULL(ARRAY_LENGTH(${arr}), 0) > 0`;
}

export function mapGet(mapExpr: string, key: string): string {
  return `${mapExpr}.${quoteIdent(key)}`;
}

export function mapKeys(m: string): string {
  return `OBJECT_NAMES(${m})`;
}

export function mapValues(m: string): string {
  return `OBJECT_VALUES(${m})`;
}

export function mapContains(m: string, key: string): SqlPP {
  return sqlpp`ANY k IN OBJECT_NAMES(${{ Raw: m }}) SATISFIES k = ${{ Param: key }} END`;
}

export function jsonPath(expr: string, path: string[], numeric = false): SqlPP {
  const access = sqlpp`${{ Raw: expr }}.${{ Identifier: path.join('.') }}`;
  if (!numeric) return access;
  return sqlpp`TONUMBER(${access})`;
}

export function ilike(x: string, pattern: string): SqlPP {
  return sqlpp`LOWER(${{ Raw: x }}) LIKE LOWER(${{ Param: pattern }}) ESCAPE "\\\\"`;
}

export function containsCI(x: string, s: string): SqlPP {
  return sqlpp`CONTAINS(LOWER(${{ Raw: x }}), LOWER(${{ Param: s }}))`;
}

export function regexMatch(x: string, re: string): SqlPP {
  return sqlpp`REGEXP_CONTAINS(${{ Raw: x }}, ${{ Param: re }})`;
}

export function hasToken(
  x: string,
  term: string,
  search?: { alias: string; index: string; field: string },
): SqlPP {
  if (search) {
    const q = { match: term, field: search.field, operator: 'and' };
    return sqlpp`SEARCH(${{ Raw: search.alias }}, ${{ Param: q }}, {"index": ${{ Param: search.index }}})`;
  }
  const re = `(^|[^A-Za-z0-9])${escapeRegex(term)}([^A-Za-z0-9]|$)`;
  return sqlpp`REGEXP_CONTAINS(${{ Raw: x }}, ${{ Param: re }})`;
}

export function lower(x: string): string {
  return `LOWER(${x})`;
}

export function upper(x: string): string {
  return `UPPER(${x})`;
}

export function concat(...parts: string[]): string {
  return `CONCAT(${parts.join(', ')})`;
}

export function round(x: string): string {
  return `ROUND(${x})`;
}

export function floor(x: string): string {
  return `FLOOR(${x})`;
}

export function abs(x: string): string {
  return `ABS(${x})`;
}

export function toString(x: string): string {
  return `TOSTRING(${x})`;
}

export function toNumber(x: string): string {
  return `TONUMBER(${x})`;
}

export function toInt(x: string): string {
  return `TRUNC(TONUMBER(${x}))`;
}

export function ifThen(c: string, a: string, b: string): string {
  return `CASE WHEN ${c} THEN ${a} ELSE ${b} END`;
}

export function multiIf(pairs: [string, string][], elseExpr: string): string {
  const whens = pairs.map(([c, a]) => `WHEN ${c} THEN ${a}`).join(' ');
  return `CASE ${whens} ELSE ${elseExpr} END`;
}

export function intDiv(a: string, b: string): string {
  return `IDIV(${a}, ${b})`;
}

export function cast(x: string, type: string): string {
  const norm = type.toLowerCase();
  if (norm.includes('float') || norm === 'number' || norm.includes('double')) {
    return `TONUMBER(${x})`;
  }
  if (norm.includes('int')) return `TRUNC(TONUMBER(${x}))`;
  if (norm.includes('string')) return `TOSTRING(${x})`;
  if (norm.includes('bool')) return `TOBOOLEAN(${x})`;
  throw new CouchbaseUnsupportedError(`cast to ${type}`);
}

export function groupArray(x: string): string {
  return `ARRAY_AGG(${x})`;
}

export function groupUniqArray(x: string): string {
  return `ARRAY_AGG(DISTINCT ${x})`;
}

export function topK(n: number, x: string): SqlPP {
  return sqlpp`SELECT ${{ Raw: x }} AS \`val\`, COUNT(*) AS \`c\` GROUP BY ${{ Raw: x }} ORDER BY \`c\` DESC LIMIT ${{ Param: n }}`;
}

export function lag(x: string, partitionBy: string, orderBy: string): string {
  const partition = partitionBy.trim() ? `PARTITION BY ${partitionBy} ` : '';
  return `LAG(${x}) OVER (${partition}ORDER BY ${orderBy})`;
}

function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
