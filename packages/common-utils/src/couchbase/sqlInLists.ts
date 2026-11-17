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
