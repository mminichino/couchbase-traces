import type { ChSql } from '@couchbase-traces/common-utils/dist/query';
import { chSql } from '@couchbase-traces/common-utils/dist/query';

/**
 * SQL++ session-list CTE merge (Phase 7 §9.5).
 * Mirrors `buildSessionsCtes` / `unionSessionIds` with CASE/IFNULL instead of
 * ClickHouse `if` / `maxIf` / `ifNull`, and `UNION` instead of `UNION DISTINCT`.
 */

export function unionSessionIdsCouchbase(
  rumIds: ChSql,
  otelIds: ChSql | undefined,
): ChSql {
  return otelIds == null
    ? rumIds
    : chSql`SELECT sessionId FROM (${rumIds}) UNION SELECT sessionId FROM (${otelIds})`;
}

export function buildSessionsCtesCouchbase({
  name,
  spans,
  recordings,
  withActivityFilter,
}: {
  name: string;
  spans: ChSql;
  recordings: ChSql | undefined;
  withActivityFilter: boolean;
}): ChSql {
  const recordingsUnion =
    recordings != null
      ? `UNION ALL
      SELECT serviceName AS svc, sessionId AS sid, maxTimestamp AS maxTs,
        minTimestamp AS minTs, 0 AS spans, 0 AS errors, 0 AS interactions,
        0 AS recordInits, rumRows, '' AS email, '' AS name, '' AS tid,
        '' AS tname, 1 AS fromReplay
      FROM _recordings`
      : '';
  const having = withActivityFilter
    ? `HAVING ${recordings != null ? 'MAX(fromReplay) = 1 OR ' : ''}interactionCount > 0 OR recordingCount > 0`
    : '';
  return chSql`
    WITH _spans AS (${spans}),
    ${recordings != null ? chSql`_recordings AS (${recordings}),` : ''}
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
      )
      GROUP BY svc, sid
      ${having}
      ORDER BY maxTimestamp DESC
      LIMIT 500
    )
  `;
}

/** ClickHouse `simpleJSONExtractInt(Body, 'type')` → SQL++. */
export function rrwebBodyTypeExpr(bodyExpression: string): string {
  return `IFNULL(TONUMBER(DECODE_JSON(${bodyExpression}).\`type\`), 0)`;
}

/** ClickHouse `toUInt64OrZero(x)` → SQL++. */
export function toUInt64OrZeroCouchbase(expr: string): string {
  return `IFNULL(TONUMBER(${expr}), 0)`;
}

/** ClickHouse `if(a != '', a, b)` → SQL++. */
export function ifNonEmptyCouchbase(a: string, b: string): string {
  return `CASE WHEN ${a} != '' THEN ${a} ELSE ${b} END`;
}
