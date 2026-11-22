/**
 * SQL++ `IN` / `NOT IN` take an array (`IN ['a', 'b']`). Parenthesized
 * value lists (`IN ('a')`) parse as a scalar or subquery and match nothing
 * (or are a syntax error for multiple values). Rewrite value-list forms
 * that appear in rendered SQL++ while leaving `IN (SELECT …)` alone.
 */

/** A single SQL string literal, boolean, or NULL, with optional surrounding space. */
const VALUE = String.raw`(?:\s*(?:NULL|true|false|'(?:[^'\\]|\\.|'')*')\s*)`;

/** `IN ( 'a', 'b' )` / `NOT IN (NULL)` — value lists only, not subqueries. */
const IN_VALUE_LIST = new RegExp(
  String.raw`\b(NOT\s+)?IN\s*\((${VALUE}(?:,${VALUE})*)\)`,
  'gi',
);

/**
 * Rewrite `IN ('a', 'b')` → `IN ['a', 'b']` (and the `NOT IN` form).
 * Subqueries such as `IN (SELECT …)` are left unchanged.
 */
export function rewriteSqlInValueLists(sql: string): string {
  return sql.replace(
    IN_VALUE_LIST,
    (_full, notPrefix: string, inner: string) => {
      const not = notPrefix ?? '';
      return `${not}IN [${inner}]`;
    },
  );
}

/**
 * `IN (SELECT `, anchored at the scan position. What follows is checked by
 * {@link singleColumnRaw}: one plain column (no comma, parenthesis, `*` or
 * `AS`) before `FROM`; anything richer is left as written.
 */
const IN_SUBQUERY_OPEN = /\b(?:NOT\s)?\s*IN\s*\(\s*SELECT\s+/iy;
const SELECT_MODIFIER = /^(?:RAW|VALUE|ELEMENT)\b/i;
const DISTINCT_PREFIX = /^DISTINCT\s+/i;
const FROM_KEYWORD = /\sFROM\b/i;
const NOT_PLAIN_COLUMN = /[,()*]|\bAS\b/i;

/**
 * Rewrite `IN (SELECT x FROM …)` → `IN (SELECT RAW x FROM …)`. SQL++ `SELECT x`
 * yields objects (`{"x": …}`), which IN never equals a scalar to, so the
 * ClickHouse form silently matches nothing. Quoted text is skipped.
 */
export function rewriteInSubqueriesToRaw(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const ch = sql.charAt(i);
    if (ch === "'" || ch === '"' || ch === '`') {
      const end = closingQuote(sql, i);
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    IN_SUBQUERY_OPEN.lastIndex = i;
    const open = IN_SUBQUERY_OPEN.exec(sql);
    if (open != null) {
      const head = open[0];
      const rest = sql.slice(i + head.length);
      const distinct = DISTINCT_PREFIX.exec(rest)?.[0] ?? '';
      const raw = isSingleColumn(rest.slice(distinct.length)) ? 'RAW ' : '';
      out += head + distinct + raw;
      i += head.length + distinct.length;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** `rest` starts with one plain column (no modifier) followed by FROM. */
function isSingleColumn(rest: string): boolean {
  if (SELECT_MODIFIER.test(rest)) return false;
  const from = FROM_KEYWORD.exec(rest);
  if (from == null) return false;
  const column = rest.slice(0, from.index);
  return column.trim() !== '' && !NOT_PLAIN_COLUMN.test(column);
}

/** Index just past the literal or quoted identifier opening at `start`. */
function closingQuote(sql: string, start: number): number {
  const q = sql.charAt(start);
  let i = start + 1;
  while (i < sql.length) {
    const c = sql.charAt(i);
    if (c === '\\') {
      i += 2;
      continue;
    }
    if (c === q) {
      // A doubled quote is an escaped quote inside the literal.
      if (sql.charAt(i + 1) === q) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i++;
  }
  return sql.length;
}
