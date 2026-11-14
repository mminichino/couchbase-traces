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
