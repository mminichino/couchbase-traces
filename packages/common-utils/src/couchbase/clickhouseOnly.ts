import { MAPPINGS } from './functions';

/**
 * ClickHouse functions that are not SQL++ functions, for guards that assert
 * generated SQL++ is free of them. Derived from MAPPINGS: a ClickHouse name is
 * kept when its documented SQL++ form does not start with the same function
 * (SQL++ function names are case-insensitive, so `toString` is TOSTRING and
 * `lower` is LOWER). Functions MAPPINGS does not list are added by hand.
 */
const FUNCTION_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

const UNLISTED = [
  'startsWith',
  'endsWith',
  'cityHash64',
  // Neither engine's name: written by hand for SQL++ before D10.
  'CRC32',
  'sipHash64',
  'toDateTime',
  'toDateTime64',
  'parseDateTime64BestEffort',
  'parseDateTime64BestEffortOrNull',
  'toFloat64OrZero',
  'toInt64OrZero',
  'rand',
  'anyLast',
  'getSetting',
  'splitByChar',
  'replaceRegexpAll',
];

/** Names MAPPINGS maps elsewhere that are still valid SQL++ calls. */
const SQLPP_ALSO = new Set(['length', 'cast']);

const LEADING_CALL = /^([A-Za-z_][A-Za-z0-9_]*)\s*\(/;

function sqlppLeadingFunction(sqlpp: string): string | undefined {
  const m = LEADING_CALL.exec(sqlpp.trim());
  return m ? m[1] : undefined;
}

export const CLICKHOUSE_ONLY_FUNCTIONS: readonly string[] = [
  ...new Set([
    ...MAPPINGS.filter(row => FUNCTION_NAME.test(row.clickhouse))
      .filter(
        row =>
          sqlppLeadingFunction(row.sqlpp)?.toLowerCase() !==
          row.clickhouse.toLowerCase(),
      )
      .map(row => row.clickhouse),
    ...UNLISTED,
  ]),
].filter(name => !SQLPP_ALSO.has(name.toLowerCase()));

const ONLY_LOWER = new Set(CLICKHOUSE_ONLY_FUNCTIONS.map(n => n.toLowerCase()));

/** Text outside string literals and backtick identifiers, same length. */
function blankLiterals(sql: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql.charAt(i);
    if (quote) {
      if (ch === '\\' && quote !== '`') {
        out += '  ';
        i++;
        continue;
      }
      if (ch === quote) {
        if (sql[i + 1] === quote) {
          out += '  ';
          i++;
          continue;
        }
        quote = null;
        out += ch;
        continue;
      }
      out += ' ';
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    out += ch;
  }
  return out;
}

/**
 * ClickHouse-only constructs in a SQL++ statement, in order of appearance:
 * calls to CLICKHOUSE_ONLY_FUNCTIONS, the zero-argument `count()`, the
 * parametric `quantile(l)(x)` form, and `{name:Type}` query parameters.
 * String literals and backtick identifiers are ignored, so an alias such as
 * `count()` is not reported.
 */
export function findClickhouseOnlyConstructs(sql: string): string[] {
  const text = blankLiterals(sql);
  const found: string[] = [];
  for (const m of text.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/g)) {
    const name = m[1];
    const prev = text[(m.index ?? 0) - 1];
    if (prev === '.' || prev === '$') continue;
    const lower = name.toLowerCase();
    if (lower === 'count' && /^count\s*\(\s*\)/i.test(text.slice(m.index))) {
      found.push('count()');
    } else if (
      lower === 'quantile' &&
      /^quantile\s*\([^()]*\)\s*\(/i.test(text.slice(m.index))
    ) {
      found.push('quantile(level)(x)');
    } else if (ONLY_LOWER.has(lower) && lower !== 'count') {
      found.push(name);
    }
  }
  for (const m of text.matchAll(/\{\s*([A-Za-z_]\w*)\s*:\s*[A-Z]\w*\s*\}/g)) {
    found.push(`{${m[1]}:Type}`);
  }
  return found;
}
