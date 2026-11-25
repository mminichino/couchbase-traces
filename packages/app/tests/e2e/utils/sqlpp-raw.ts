/**
 * SQL++ forms of the raw SQL tile templates upstream's specs type in
 * ClickHouse SQL. Raw SQL tiles run as written, so on Couchbase they are
 * SQL++: the E2E Logs collection, `COUNT(*)`, and the time-range parameters
 * as `$startDateMilliseconds` / `$endDateMilliseconds` / `$intervalSeconds`
 * (`couchbase/render/macros.ts`) compared against `STR_TO_MILLIS(Timestamp)`.
 * Each keeps upstream's shape: same columns, aliases, grouping, and bounds.
 */
export const E2E_LOGS_KEYSPACE = 'otel.`default`.otel_logs';

const range = (endOp: '<' | '<=') =>
  `STR_TO_MILLIS(Timestamp) >= $startDateMilliseconds AND STR_TO_MILLIS(Timestamp) ${endOp} $endDateMilliseconds`;

const tsBucket =
  'MILLIS_TO_STR(FLOOR(STR_TO_MILLIS(Timestamp) / ($intervalSeconds * 1000)) * $intervalSeconds * 1000)';

/** `toStartOfInterval(...) AS ts, count() AS count ... GROUP BY ts ORDER BY ts`. */
export function rawLineSql(extraWhere = ''): string {
  return `SELECT ts, COUNT(*) AS count FROM ${E2E_LOGS_KEYSPACE} LET ts = ${tsBucket} WHERE ${range('<')}${extraWhere} GROUP BY ts ORDER BY ts ASC`;
}

/** `SELECT ServiceName, count() AS count ... GROUP BY ServiceName LIMIT 200`. */
export function rawServiceCountSql(extraWhere = ''): string {
  return `SELECT ServiceName, COUNT(*) AS count FROM ${E2E_LOGS_KEYSPACE} WHERE ${range('<=')}${extraWhere} GROUP BY ServiceName LIMIT 200`;
}

export const RAW_NUMBER_SQL = `SELECT 1234 FROM ${E2E_LOGS_KEYSPACE} WHERE ${range('<')}`;

/** Upstream's unaliased `count()` column; SQL++ names it `$1`. */
export const RAW_PIE_SQL = `SELECT ServiceName, COUNT(*) FROM ${E2E_LOGS_KEYSPACE} WHERE ${range('<')} GROUP BY ServiceName`;

/** `$__conditionalAll($__timeFilter(Timestamp), $svc) AND $__filter(...)`. */
export const RAW_NESTED_MACRO_SQL = `SELECT ServiceName, COUNT(*) AS count FROM ${E2E_LOGS_KEYSPACE} WHERE $__conditionalAll($__timeFilter(Timestamp), $svc) AND $__filter(ServiceName, $svc) GROUP BY ServiceName LIMIT 200`;
