import type { SqlFrag } from '@couchbase-traces/common-utils/dist/query';
import { sqlExpr } from '@couchbase-traces/common-utils/dist/query';

/**
 * SQL++ session-list CTE merge (Phase 7 §9.5).
 * Mirrors `buildSessionsCtes` / `unionSessionIds` with CASE/IFNULL instead of
 * legacy store `if` / `maxIf` / `ifNull`, and `UNION` instead of `UNION DISTINCT`.
 * SQL++ requires an alias on every FROM subquery (error 3000).
 */

export function unionSessionIdsCouchbase(
  rumIds: SqlFrag,
  otelIds: SqlFrag | undefined,
): SqlFrag {
  return otelIds == null
    ? rumIds
    : sqlExpr`SELECT sessionId FROM (${rumIds}) AS rum_ids UNION SELECT sessionId FROM (${otelIds}) AS otel_ids`;
}

export function buildSessionsCtesCouchbase({
  name,
  spans,
  recordings,
  withActivityFilter,
}: {
  name: string;
  spans: SqlFrag;
  recordings: SqlFrag | undefined;
  withActivityFilter: boolean;
}): SqlFrag {
  const recordingsUnion =
    recordings != null
      ? `UNION ALL
      SELECT serviceName AS svc, sessionId AS sid, maxTimestamp AS maxTs,
        minTimestamp AS minTs, 0 AS spans, 0 AS errors, 0 AS interactions,
        0 AS recordInits, rumRows, '' AS email, '' AS name, '' AS tid,
        '' AS tname, 1 AS fromReplay
      FROM _recordings`
      : '';
  // Aggregates, not the select aliases: SQL++ would resolve
  // `interactionCount` in HAVING as a field of `merged` (4210).
  const having = withActivityFilter
    ? `HAVING ${recordings != null ? 'MAX(fromReplay) = 1 OR ' : ''}SUM(interactions) > 0 OR SUM(recordInits) > 0`
    : '';
  return sqlExpr`
    WITH _spans AS (${spans}),
    ${recordings != null ? sqlExpr`_recordings AS (${recordings}),` : ''}
    ${name} AS (
      SELECT svc AS serviceName, sid AS sessionId,
        CASE WHEN SUM(rumRows) > 0 THEN 'rum.sessionId' ELSE 'session.id' END AS sessionIdKey,
        CASE
          WHEN SUM(rumRows) > 0 AND SUM(spans) > 0
          THEN MAX(CASE WHEN fromReplay = 0 THEN maxTs END)
          ELSE MAX(maxTs)
        END AS maxTimestamp,
        CASE
          WHEN SUM(rumRows) > 0 AND SUM(spans) > 0
          THEN MIN(CASE WHEN fromReplay = 0 THEN minTs END)
          ELSE MIN(minTs)
        END AS minTimestamp,
        SUM(spans) AS sessionCount, SUM(errors) AS errorCount,
        SUM(interactions) AS interactionCount, SUM(recordInits) AS recordingCount,
        IFNULL(MAX(email), '') AS userEmail, IFNULL(MAX(name), '') AS userName,
        MAX(tid) AS teamId, MAX(tname) AS teamName
      FROM (
        SELECT serviceName AS svc, sessionId AS sid, maxTimestamp AS maxTs,
          minTimestamp AS minTs, sessionCount AS spans, errorCount AS errors,
          interactionCount AS interactions, recordingCount AS recordInits,
          rumRows, userEmail AS email, userName AS name, teamId AS tid,
          teamName AS tname, 0 AS fromReplay
        FROM _spans
        ${recordingsUnion}
      ) AS merged
      GROUP BY svc, sid
      ${having}
      ORDER BY maxTimestamp DESC
      LIMIT 500
    )
  `;
}

/** legacy store `simpleJSONExtractInt(Body, 'type')` → SQL++. */
export function rrwebBodyTypeExpr(bodyExpression: string): string {
  return `IFNULL(TONUMBER(DECODE_JSON(${bodyExpression}).\`type\`), 0)`;
}

/** legacy store `toUInt64OrZero(x)` → SQL++. */
export function toUInt64OrZeroCouchbase(expr: string): string {
  return `IFNULL(TONUMBER(${expr}), 0)`;
}

/** legacy store `if(a != '', a, b)` → SQL++. */
export function ifNonEmptyCouchbase(a: string, b: string): string {
  return `CASE WHEN ${a} != '' THEN ${a} ELSE ${b} END`;
}
