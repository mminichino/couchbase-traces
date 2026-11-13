/**
 * Inlines `$name` parameters for logs and the SQL viewer. Never executed.
 * Placeholders inside string literals and backtick identifiers are left alone.
 */
export function sqlppToDisplay(q: {
  sql: string;
  params: Record<string, unknown>;
}): string {
  let out = '';
  let i = 0;
  const sql = q.sql;
  while (i < sql.length) {
    const ch = sql.slice(i, i + 1);
    if (ch === "'" || ch === '"') {
      const end = scanQuoted(sql, i, ch);
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '`') {
      const end = scanBacktick(sql, i);
      out += sql.slice(i, end);
      i = end;
      continue;
    }
    if (ch === '$') {
      const match = /^\$([A-Za-z_][A-Za-z0-9_]*)/.exec(sql.slice(i));
      if (match) {
        const name = match[1] ?? '';
        const value = Object.entries(q.params).find(([key]) => key === name);
        out += value ? JSON.stringify(value[1]) : match[0];
        i += match[0].length;
        continue;
      }
    }
    out += ch;
    i += 1;
  }
  return out;
}

function scanQuoted(sql: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < sql.length) {
    const ch = sql.slice(i, i + 1);
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === quote) {
      if (sql.slice(i + 1, i + 2) === quote) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  return sql.length;
}

function scanBacktick(sql: string, start: number): number {
  let i = start + 1;
  while (i < sql.length) {
    if (sql.slice(i, i + 1) === '`') {
      if (sql.slice(i + 1, i + 2) === '`') {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  return sql.length;
}
