import { rewriteSqlInValueLists } from '@/couchbase/sqlInLists';
import { quoteIdent } from '@/couchbase/sqlpp';

/**
 * ClickHouse reads a map value with a string subscript, `SpanAttributes['k']`.
 * SQL++ reads `obj['k']` as an array index, which is NULL on an object, so a
 * builder tile grouped or filtered that way returns empty groups or no rows.
 * Field access is `` obj.`k` ``; the backticks keep dotted OTel keys
 * (`http.route`) one field rather than a nested path.
 *
 * The rewrite is applied to builder expression text (select, where, filters,
 * group by, order by, having). It skips string literals, double-quoted text
 * and backticked identifiers, leaves numeric subscripts (`arr[0]`) and array
 * literals after keywords (`IN ['a']`) alone, and only touches a quoted key
 * directly after an identifier, `)` or `]`.
 */

/** Words that can sit right before an array literal, `IN['a']`. */
const KEYWORDS_BEFORE_ARRAY = new Set([
  'AND',
  'ANY',
  'ARRAY',
  'AS',
  'BY',
  'CASE',
  'DISTINCT',
  'ELEMENT',
  'ELSE',
  'EVERY',
  'EXISTS',
  'FROM',
  'HAVING',
  'IN',
  'IS',
  'LIKE',
  'NOT',
  'ON',
  'OR',
  'RAW',
  'RETURN',
  'SATISFIES',
  'SELECT',
  'SOME',
  'THEN',
  'VALUE',
  'VALUES',
  'WHEN',
  'WHERE',
  'WITHIN',
]);

const IDENT_CHAR = /[A-Za-z0-9_$]/;

/** End index (exclusive) of the quoted run that opens at `start`. */
function skipQuoted(sql: string, start: number): number {
  const quote = sql.charAt(start);
  let i = start + 1;
  while (i < sql.length) {
    const ch = sql.charAt(i);
    if (ch === '\\' && quote !== '`') {
      i += 2;
      continue;
    }
    if (ch === quote) {
      if (sql.charAt(i + 1) === quote) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  return sql.length;
}

/** The key of a `'k'` / `"k"` literal, with `''` and `\x` escapes undone. */
function unquoteKey(literal: string): string {
  const quote = literal.charAt(0);
  return literal
    .slice(1, -1)
    .replace(/\\(.)/g, '$1')
    .split(quote + quote)
    .join(quote);
}

/** Whether the text before `[` at `at` is something a map can be read from. */
function isSubscriptTarget(sql: string, at: number): boolean {
  const prev = sql.charAt(at - 1);
  if (prev === '`' || prev === ')' || prev === ']') return true;
  if (!IDENT_CHAR.test(prev)) return false;
  let start = at - 1;
  while (start > 0 && IDENT_CHAR.test(sql.charAt(start - 1))) start--;
  const word = sql.slice(start, at);
  if (/^\d/.test(word)) return false;
  return !KEYWORDS_BEFORE_ARRAY.has(word.toUpperCase());
}

/**
 * A `[ 'k' ]` subscript opening at `at`: the key and the end index, or
 * undefined when the brackets hold anything other than one quoted string.
 */
function readStringSubscript(
  sql: string,
  at: number,
): { key: string; end: number } | undefined {
  let i = at + 1;
  while (/\s/.test(sql.charAt(i))) i++;
  const quote = sql.charAt(i);
  if (quote !== "'" && quote !== '"') return undefined;
  const close = skipQuoted(sql, i);
  if (close > sql.length || sql.charAt(close - 1) !== quote) return undefined;
  const literal = sql.slice(i, close);
  let j = close;
  while (/\s/.test(sql.charAt(j))) j++;
  if (sql.charAt(j) !== ']') return undefined;
  return { key: unquoteKey(literal), end: j + 1 };
}

/**
 * Rewrite every ClickHouse map subscript in `sql` to SQL++ field access:
 * `SpanAttributes['http.route']` → `` SpanAttributes.`http.route` ``.
 * Throws when a key cannot be an identifier (empty, or containing a backtick,
 * NUL or newline), the same rule `quoteIdent` applies everywhere else.
 */
export function rewriteMapSubscripts(sql: string): string {
  if (!sql.includes('[')) return sql;
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql.charAt(i);
    if (ch === "'" || ch === '"' || ch === '`') {
      const end = skipQuoted(sql, i);
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '[' && isSubscriptTarget(sql, i)) {
      const sub = readStringSubscript(sql, i);
      if (sub) {
        out += `.${quoteIdent(sub.key)}`;
        i = sub.end;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * A user-written SQL condition (where, filter, having) as SQL++: map
 * subscripts become field access and `IN ('a')` value lists become arrays.
 */
export function rewriteSqlFragment(sql: string): string {
  return rewriteSqlInValueLists(rewriteMapSubscripts(sql));
}
