/** Default row cap for MCP raw SQL when the statement has no outer LIMIT. */
export const MCP_RAW_SQL_DEFAULT_LIMIT = 1000;

/**
 * Strip single-quoted string literals so LIMIT detection does not match inside
 * strings.
 */
function withoutStringLiterals(sql: string): string {
  return sql.replace(/'(?:[^'\\]|\\.|'')*'/g, "''");
}

/**
 * True when the outermost SELECT (or trailing subquery wrapper) already has
 * a LIMIT clause.
 */
export function hasOutermostLimit(sql: string): boolean {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  const bare = withoutStringLiterals(trimmed);
  return /\bLIMIT\s+(\d+|\$[A-Za-z_][\w]*)/i.test(bare);
}

/**
 * Append a LIMIT to the outermost statement when missing (MCP raw SQL safety).
 */
export function ensureOutermostSelectLimit(
  sql: string,
  defaultLimit: number = MCP_RAW_SQL_DEFAULT_LIMIT,
): string {
  const trimmed = sql.trim().replace(/;+\s*$/, '');
  if (hasOutermostLimit(trimmed)) return trimmed;
  return `${trimmed} LIMIT ${defaultLimit}`;
}
