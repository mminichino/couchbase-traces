import { keyspace, quoteIdent, type SqlPP, sqlpp } from '@/couchbase/sqlpp';
import { type TimeFormat, timeRangePredicate } from '@/couchbase/time';

import type { Keyspace } from './types';

export function inferStatement(ks: Keyspace, sampleSize: number): SqlPP {
  // Couchbase requires INFER's WITH options to be a static object literal;
  // a named parameter ($pN) fails with "WITH value must be static".
  const n = Number.isFinite(sampleSize)
    ? Math.max(1, Math.min(Math.trunc(sampleSize), 10000))
    : 1000;
  const opts = JSON.stringify({ sample_size: n, num_sample_values: 5 });
  return sqlpp`INFER ${{ Keyspace: ks }} WITH ${{ Raw: opts }}`;
}

export function keyspaceList(): SqlPP {
  return sqlpp`SELECT RAW [k.\`bucket\`, k.\`scope\`, k.\`name\`] FROM system:all_keyspaces AS k WHERE k.\`namespace\` = ${{ Param: 'default' }} AND k.\`scope\` IS VALUED AND k.\`scope\` != ${{ Param: '_system' }}`;
}

export function metricNames(
  ks: Keyspace,
  tsExpr: string,
  format: TimeFormat,
  from: Date,
  to: Date,
  limit: number,
  namePattern?: string,
): SqlPP {
  const range = timeRangePredicate(tsExpr, format, from, to);
  const pattern = namePattern
    ? sqlpp` AND LOWER(m.\`MetricName\`) LIKE ${{ Param: `%${namePattern.toLowerCase().replace(/[\\%_]/g, c => `\\${c}`)}%` }} ESCAPE "\\\\"`
    : sqlpp``;
  return sqlpp`SELECT DISTINCT RAW m.\`MetricName\` FROM ${{ Keyspace: ks }} AS m WHERE ${range} AND m.\`MetricName\` IS NOT MISSING${pattern} LIMIT ${{ Param: limit }}`;
}

export function mapKeys(
  ks: Keyspace,
  mapName: string,
  tsExpr: string,
  format: TimeFormat,
  from: Date,
  to: Date,
  sample: number,
  max: number,
): SqlPP {
  const range = timeRangePredicate(`d.${quoteIdent(tsExpr)}`, format, from, to);
  const map = `d.${quoteIdent(mapName)}`;
  return sqlpp`SELECT DISTINCT RAW k FROM (SELECT ${{ Raw: map }} AS m FROM ${{ Keyspace: ks }} AS d WHERE ${range} ORDER BY d.${{ Identifier: tsExpr }} DESC LIMIT ${{ Param: sample }}) AS s UNNEST OBJECT_NAMES(s.m) AS k LIMIT ${{ Param: max }}`;
}

export function sampledValues(
  ks: Keyspace,
  valueExpr: string,
  tsExpr: string,
  format: TimeFormat,
  from: Date,
  to: Date,
  sample: number,
  max: number,
): SqlPP {
  const range = timeRangePredicate(`d.${quoteIdent(tsExpr)}`, format, from, to);
  return sqlpp`SELECT v AS \`value\`, COUNT(*) AS \`count\` FROM (SELECT ${{ Raw: valueExpr }} AS v FROM ${{ Keyspace: ks }} AS d WHERE ${range} AND ${{ Raw: valueExpr }} IS VALUED ORDER BY d.${{ Identifier: tsExpr }} DESC LIMIT ${{ Param: sample }}) AS s GROUP BY v ORDER BY \`count\` DESC LIMIT ${{ Param: max }}`;
}

export function validateStatement(ks: Keyspace, expression: string): SqlPP {
  return sqlpp`EXPLAIN SELECT ${{ Raw: expression }} AS v FROM ${{ Keyspace: ks }} AS d LIMIT 0`;
}

export function versionStatement(): SqlPP {
  return sqlpp`SELECT RAW ds_version()`;
}

export function qualified(ks: Keyspace): string {
  return keyspace(ks);
}
