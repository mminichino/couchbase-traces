import { quoteIdent } from '@/couchbase/sqlpp';

/**
 * ClickHouse `JSONExtract{String,Float,Int,Bool}(json, 'k1', 'k2', …)` reads a
 * path of keys (each argument is one level, dots included) from a JSON string
 * and yields the type's default on a miss. "Add to Filters" on parsed JSON
 * builds these keys (`JSONExtractString(Body, 'app.user.currency')`).
 *
 * SQL++ decodes the string with DECODE_JSON; a value Couchbase already stores
 * as an object is read directly.
 */
const DEFAULTS: Record<string, { cast: string; empty: string }> = {
  jsonextractstring: { cast: 'TOSTRING', empty: "''" },
  jsonextractfloat: { cast: 'TONUMBER', empty: '0' },
  jsonextractint: { cast: 'TONUMBER', empty: '0' },
  jsonextractuint: { cast: 'TONUMBER', empty: '0' },
  jsonextractbool: { cast: 'TOBOOLEAN', empty: 'FALSE' },
};

const CALL = /\bJSONExtract(String|Float|Int|UInt|Bool)\s*\(/gi;

/** Index just past the quoted run starting at `i`, honoring `\` and doubling. */
function skipQuoted(sql: string, i: number): number {
  const q = sql.charAt(i);
  let j = i + 1;
  while (j < sql.length) {
    const c = sql.charAt(j);
    if (c === '\\') {
      j += 2;
      continue;
    }
    if (c === q) {
      if (sql.charAt(j + 1) === q) {
        j += 2;
        continue;
      }
      return j + 1;
    }
    j++;
  }
  return j;
}

/** Top-level comma-separated arguments from `open` (just past `(`) to `)`. */
function splitArgs(
  sql: string,
  open: number,
): { args: string[]; end: number } | undefined {
  const args: string[] = [];
  let depth = 0;
  let start = open;
  let i = open;
  while (i < sql.length) {
    const c = sql.charAt(i);
    if (c === "'" || c === '"' || c === '`') {
      i = skipQuoted(sql, i);
      continue;
    }
    if (c === '(' || c === '[') depth++;
    else if (c === ']') depth--;
    else if (c === ')') {
      if (depth === 0) {
        args.push(sql.slice(start, i).trim());
        return { args, end: i + 1 };
      }
      depth--;
    } else if (c === ',' && depth === 0) {
      args.push(sql.slice(start, i).trim());
      start = i + 1;
    }
    i++;
  }
  return undefined;
}

/** A single-quoted ClickHouse string literal's value, else undefined. */
function stringLiteral(arg: string): string | undefined {
  if (!/^'.*'$/s.test(arg)) return undefined;
  return arg.slice(1, -1).replace(/\\'/g, "'").replace(/''/g, "'");
}

export function rewriteJsonExtract(sql: string): string {
  if (!/JSONExtract/i.test(sql)) return sql;
  let out = '';
  let last = 0;
  CALL.lastIndex = 0;
  for (let m = CALL.exec(sql); m != null; m = CALL.exec(sql)) {
    if (m.index < last) continue;
    const parsed = splitArgs(sql, m.index + m[0].length);
    if (parsed == null || parsed.args.length < 2) continue;
    const [base, ...rest] = parsed.args;
    const keys: string[] = [];
    for (const arg of rest) {
      const k = stringLiteral(arg);
      if (k == null || k.includes('`')) break;
      keys.push(k);
    }
    if (keys.length !== rest.length) continue;
    const spec = DEFAULTS[`jsonextract${m[1].toLowerCase()}`];
    const inner = rewriteJsonExtract(base);
    const decoded = `(CASE WHEN ISSTRING(${inner}) THEN DECODE_JSON(${inner}) ELSE ${inner} END)`;
    const path = keys.map(k => `.${quoteIdent(k)}`).join('');
    out += sql.slice(last, m.index);
    out += `IFMISSINGORNULL(${spec.cast}(${decoded}${path}), ${spec.empty})`;
    last = parsed.end;
    CALL.lastIndex = parsed.end;
  }
  return out + sql.slice(last);
}
