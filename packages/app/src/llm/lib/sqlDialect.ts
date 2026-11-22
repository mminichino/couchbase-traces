import SqlString from 'sqlstring';
import {
  ifThen,
  mapGet,
  multiIf,
  toNumber,
} from '@couchbase-traces/common-utils/dist/couchbase/fn/scalar';

import type { SqlDialect } from '@/couchbase/dialectExpr';

export type { SqlDialect };

/**
 * The handful of SQL constructs the LLM dashboard builds its expressions
 * from, per dialect. ClickHouse output is byte-identical to upstream; the
 * Couchbase forms are SQL++ 8.0 functions (case-insensitive names).
 */
export type LLMSql = {
  dialect: SqlDialect;
  /** Map-column value (ClickHouse `''` / SQL++ MISSING when absent). */
  mapValue: (field: string, key: string) => string;
  /** Key presence on a map column. */
  mapHasKey: (field: string, key: string) => string;
  /** Numeric value, 0 when absent or unparsable. */
  numberOrZero: (x: string) => string;
  greatest: (args: string[]) => string;
  ifElse: (c: string, a: string, b: string) => string;
  multiIf: (pairs: [string, string][], elseExpr: string) => string;
  regexpMatches: (x: string, patternLiteral: string) => string;
  regexpReplaceAll: (
    x: string,
    patternLiteral: string,
    replacementLiteral: string,
  ) => string;
  /**
   * ClickHouse skip-index pruning hint. SQL++ has no equivalent, so callers
   * emit the value term alone (`undefined`).
   */
  indexHint: ((x: string) => string) | undefined;
};

const CLICKHOUSE: LLMSql = {
  dialect: 'clickhouse',
  mapValue: (field, key) => `${field}['${key}']`,
  mapHasKey: (field, key) => `mapContains(${field}, ${SqlString.escape(key)})`,
  numberOrZero: x => `toFloat64OrZero(${x})`,
  greatest: args => `greatest(${args.join(', ')})`,
  ifElse: (c, a, b) => `if(${c}, ${a}, ${b})`,
  multiIf: (pairs, elseExpr) =>
    `multiIf(${pairs.map(([c, v]) => `${c}, ${v}`).join(', ')}, ${elseExpr})`,
  regexpMatches: (x, p) => `match(${x}, ${p})`,
  regexpReplaceAll: (x, p, r) => `replaceRegexpAll(${x}, ${p}, ${r})`,
  indexHint: x => `indexHint(${x})`,
};

const COUCHBASE: LLMSql = {
  dialect: 'couchbase',
  mapValue: (field, key) => mapGet(field, key),
  // A path test, not ANY over OBJECT_NAMES: plain field access lets the
  // planner use attribute indexes and keeps the expression short.
  mapHasKey: (field, key) => `${mapGet(field, key)} IS NOT MISSING`,
  numberOrZero: x => `IFMISSINGORNULL(${toNumber(x)}, 0)`,
  greatest: args => `GREATEST(${args.join(', ')})`,
  ifElse: ifThen,
  multiIf,
  regexpMatches: (x, p) => `REGEXP_CONTAINS(${x}, ${p})`,
  regexpReplaceAll: (x, p, r) => `REGEXP_REPLACE(${x}, ${p}, ${r})`,
  indexHint: undefined,
};

export function llmSql(dialect: SqlDialect = 'clickhouse'): LLMSql {
  return dialect === 'couchbase' ? COUCHBASE : CLICKHOUSE;
}

/**
 * Per-service election (see `llmGatedSumExpr`). ClickHouse keys sumMaps by
 * service; SQL++ has no map aggregates, so it collects the gated rows once
 * with ARRAY_AGG, binds that array with `FIRST … FOR a IN [agg] END` (a
 * correlated subquery over an aggregate is rejected with 4210), and sums
 * per distinct service. Rows matching neither gate are not collected.
 */
export function perServiceElectionSql(
  sql: LLMSql,
  {
    service,
    hasProvidedCost,
    hasReportedTokens,
  }: { service: string; hasProvidedCost: string; hasReportedTokens: string },
  valueExpression: string,
): string {
  if (sql.dialect === 'clickhouse') {
    const providedCountMap = `sumMap(map(${service}, toUInt64(${hasProvidedCost})))`;
    const tokenCountMap = `sumMap(map(${service}, toUInt64(${hasReportedTokens})))`;
    const providedSumMap = `sumMap(map(${service}, if(${hasProvidedCost}, toFloat64(${valueExpression}), 0.)))`;
    const tokenSumMap = `sumMap(map(${service}, if(${hasReportedTokens}, toFloat64(${valueExpression}), 0.)))`;
    return `arraySum(arrayMap(k -> if(${providedCountMap}[k] > 0, ${providedSumMap}[k], ${tokenSumMap}[k]), arrayDistinct(arrayConcat(mapKeys(${providedCountMap}), mapKeys(${tokenCountMap})))))`;
  }
  const flag = (c: string) => `CASE WHEN ${c} THEN 1 ELSE 0 END`;
  const row = `{"s": ${service}, "p": ${flag(hasProvidedCost)}, "t": ${flag(hasReportedTokens)}, "v": ${toNumber(valueExpression)}}`;
  const rows = `ARRAY_AGG(CASE WHEN (${hasProvidedCost}) OR (${hasReportedTokens}) THEN ${row} END)`;
  const sumFor = (field: 'p' | 'v', gate: string) =>
    `IFNULL(ARRAY_SUM(ARRAY r.${field} FOR r IN a WHEN r.s = s AND ${gate} END), 0)`;
  const elected = `CASE WHEN ${sumFor('p', 'r.p = 1')} > 0 THEN ${sumFor('v', 'r.p = 1')} ELSE ${sumFor('v', 'r.t = 1')} END`;
  // ARRAY_AGG over no rows is NULL; ClickHouse's arraySum of nothing is 0.
  return `FIRST IFNULL(ARRAY_SUM(ARRAY ${elected} FOR s IN ARRAY_DISTINCT(ARRAY r.s FOR r IN a WHEN r IS NOT NULL END) END), 0) FOR a IN [${rows}] END`;
}
