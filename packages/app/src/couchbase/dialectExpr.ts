import { quoteIdent } from '@couchbase-traces/common-utils/dist/couchbase/sqlpp';

export type SqlDialect = 'clickhouse' | 'couchbase';

/**
 * legacy store `JSONExtractString(col['object'], 'a', 'b')` → SQL++
 * `TOSTRING(DECODE_JSON(col.`object`).a.b)` when the map value is a JSON string.
 */
export function jsonExtractString(
  mapAccess: string,
  path: string[],
  dialect: SqlDialect = 'clickhouse',
): string {
  if (dialect === 'clickhouse') {
    const args = path.map(p => `'${p.replace(/'/g, "\\'")}'`).join(', ');
    return `JSONExtractString(${mapAccess}, ${args})`;
  }
  const decoded = `DECODE_JSON(${mapAccess})`;
  const access = path.reduce(
    (expr, key) => `${expr}.${quoteIdent(key)}`,
    decoded,
  );
  return `TOSTRING(${access})`;
}

/** Map bracket access `col['key']` vs SQL++ `` col.`key` ``. */
export function mapKeyAccess(
  column: string,
  key: string,
  dialect: SqlDialect = 'clickhouse',
): string {
  if (dialect === 'couchbase') {
    return `${quoteIdent(column)}.${quoteIdent(key)}`;
  }
  return `${column}['${key}']`;
}

export function groupArrayExpr(
  x: string,
  dialect: SqlDialect = 'clickhouse',
): string {
  return dialect === 'couchbase' ? `ARRAY_AGG(${x})` : `groupArray(${x})`;
}

export function uuidExpr(dialect: SqlDialect = 'clickhouse'): string {
  return dialect === 'couchbase' ? 'UUID()' : 'generateUUIDv4()';
}

export function tupleElementExpr(
  tupleExpr: string,
  oneBasedIndex: number,
  dialect: SqlDialect = 'clickhouse',
): string {
  if (dialect === 'couchbase') {
    // SQL++ arrays are 0-based; legacy store tupleElement is 1-based.
    return `${tupleExpr}[${oneBasedIndex - 1}]`;
  }
  return `tupleElement(${tupleExpr}, ${oneBasedIndex})`;
}

/** SQL++ CTE that zips two arrays via UNNEST of indices (0-based). */
export function zipSeriesSqlpp({
  fromTable,
  groupColumn,
  valuesAlias,
  bucketsAlias = '__hdx_time_buckets',
}: {
  fromTable: string;
  groupColumn: string;
  valuesAlias: string;
  bucketsAlias?: string;
}): string {
  const g = quoteIdent(groupColumn);
  const v = quoteIdent(valuesAlias);
  const b = quoteIdent(bucketsAlias);
  const t = quoteIdent(fromTable);
  return `SELECT s.${g} AS ${g}, [s.${v}[i], s.${b}[i]] AS zipped FROM ${t} AS s UNNEST ARRAY_RANGE(0, ARRAY_LENGTH(s.${v}) - 1) AS i`;
}

/**
 * legacy store `age('mi', toDateTime(start), toDateTime(end))`: whole minutes
 * between two fixed instants. The bounds are literals, so SQL++ gets the
 * number itself (SQL++ has no toDateTime).
 */
export function elapsedMinutesExpr(
  start: Date,
  end: Date,
  dialect: SqlDialect = 'clickhouse',
): string {
  if (dialect === 'couchbase') {
    return String(Math.trunc((end.getTime() - start.getTime()) / 60_000));
  }
  return `age('mi', toDateTime(${start.getTime() / 1000}), toDateTime(${end.getTime() / 1000}))`;
}

/**
 * A row's value for a Map group-by key built as `col['key']`. ClickHouse
 * names that result column `arrayElement(col, 'key')`; the SQL++ renderer
 * keeps the expression text as its alias.
 */
export function groupByCell(
  row: Record<string, unknown>,
  column: string,
  key: string,
): string {
  const value =
    row[`arrayElement(${column}, '${key}')`] ?? row[`${column}['${key}']`];
  return value == null ? '' : String(value);
}

/**
 * Attributes of the first `exception` span event. ClickHouse indexes the
 * Nested column's parallel arrays (index 0 yields an empty map); Couchbase
 * stores events as an array of objects, so the miss case defaults to `{}`.
 */
export function spanExceptionAttributesExpr(
  events: string,
  dialect: SqlDialect = 'clickhouse',
): string {
  if (dialect === 'couchbase') {
    return `IFMISSINGORNULL(FIRST e.\`Attributes\` FOR e IN ${events} WHEN e.\`Name\` = 'exception' END, {})`;
  }
  return `${events}.Attributes[indexOf(${events}.Name, 'exception')]`;
}

/** A span's duration in milliseconds from its raw duration and precision. */
export function durationMsExpr(
  duration: string,
  precision: number | undefined,
  dialect: SqlDialect = 'clickhouse',
): string {
  if (dialect === 'couchbase') {
    return `IFMISSINGORNULL(TONUMBER(${duration}), 0) * 1000 / POWER(10, ${Number(precision ?? 9)})`;
  }
  return `toFloat64OrZero(toString(${duration})) * pow(10, 3) / pow(10, toInt8OrZero(toString(${precision})))`;
}

/**
 * A stable string id per span. ClickHouse hashes the three ids; SQL++ has no
 * cityHash64, and joining them is as unique as hashing them.
 */
export function spanRowIdExpr(
  ids: [traceId: string, parentSpanId: string, spanId: string],
  dialect: SqlDialect = 'clickhouse',
): string {
  if (dialect === 'couchbase') {
    const parts = ids.map(id => `IFMISSINGORNULL(TOSTRING(${id}), '')`);
    return `CONCAT2(':', ${parts.join(', ')})`;
  }
  return `toString(cityHash64(${ids.join(', ')}))`;
}

/** A constant string column. */
export function stringLiteralExpr(
  value: string,
  dialect: SqlDialect = 'clickhouse',
): string {
  const quoted = `'${value.replace(/'/g, "''")}'`;
  return dialect === 'couchbase' ? quoted : `CAST(${quoted}, 'String')`;
}

/** `then` when `cond` is a non-empty string, else `otherwise`. */
export function ifNonEmptyThenExpr(
  cond: string,
  then: string,
  otherwise: string,
  dialect: SqlDialect = 'clickhouse',
): string {
  if (dialect === 'couchbase') {
    return `CASE WHEN ${cond} != '' THEN ${then} ELSE ${otherwise} END`;
  }
  return `if(${cond} != '', ${then}, ${otherwise})`;
}
