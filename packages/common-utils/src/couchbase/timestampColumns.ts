/**
 * SQL++ for a source's `timestampValueExpression` when it lists more than one
 * column, e.g. `toDate(Timestamp), Timestamp` (upstream composite sources).
 * Upstream filters on every column, comparing a `toDate(x)` column at day
 * precision. SQL++ has no `toDate`, so that token becomes a range on `x` with
 * UTC day bounds, which selects the same rows.
 */
import { splitAndTrimWithBracket } from '@/core/utils';
import { rewriteMapSubscripts } from '@/couchbase/mapAccess';
import { concatSqlPP, type SqlPP } from '@/couchbase/sqlpp';
import { type TimeFormat, timeRangePredicate } from '@/couchbase/time';

const DAY_MS = 86_400_000;
const TO_DATE = /^toDate\s*\(\s*([^()]+?)\s*\)$/i;
const FUNCTION_CALL = /^[A-Za-z_][A-Za-z0-9_]*\s*\(/;

type Token = { expr: string; dayPrecision: boolean };

function parseTokens(timestampValueExpression: string): Token[] {
  const tokens = splitAndTrimWithBracket(timestampValueExpression).map(t => {
    const toDate = TO_DATE.exec(t);
    if (toDate) return { expr: toDate[1], dayPrecision: true };
    if (FUNCTION_CALL.test(t)) {
      throw new Error(
        `Unsupported timestamp expression "${t}": use a timestamp field, or toDate(field) for a day-precision column`,
      );
    }
    return { expr: t, dayPrecision: false };
  });
  if (tokens.length === 0) {
    throw new Error('timestampValueExpression is empty');
  }
  return tokens.map(t => ({ ...t, expr: rewriteMapSubscripts(t.expr) }));
}

/**
 * The expression to read event time from: the first full-precision column,
 * or the column inside `toDate(...)` when there is no other.
 */
export function eventTimestampExpr(timestampValueExpression: string): string {
  const tokens = parseTokens(timestampValueExpression);
  return (tokens.find(t => !t.dayPrecision) ?? tokens[0]).expr;
}

const floorDay = (d: Date) =>
  new Date(Math.floor(d.getTime() / DAY_MS) * DAY_MS);

export type TimestampSource = {
  timestampValueExpression: string;
  timestampFormat?: TimeFormat;
};

/** Inclusive `[start, end]` over every timestamp column, ANDed. */
export function timestampColumnsFilter(
  source: TimestampSource,
  start: Date,
  end: Date,
): SqlPP {
  const format = source.timestampFormat ?? 'iso8601';
  const parts = parseTokens(source.timestampValueExpression).map(t =>
    t.dayPrecision
      ? // toDate(x) <= toDate(end) is x < the next UTC midnight.
        timeRangePredicate(
          t.expr,
          format,
          floorDay(start),
          new Date(floorDay(end).getTime() + DAY_MS),
        )
      : timeRangePredicate(t.expr, format, start, end, { inclusiveEnd: true }),
  );
  return concatSqlPP(' AND ', parts);
}
