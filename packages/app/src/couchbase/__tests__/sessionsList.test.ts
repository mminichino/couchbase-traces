import {
  buildSessionsCtesCouchbase,
  ifNonEmptyCouchbase,
  rrwebBodyTypeExpr,
  toUInt64OrZeroCouchbase,
  unionSessionIdsCouchbase,
} from '@/couchbase/sessionsList';

describe('couchbase sessionsList', () => {
  it('emits SQL++ CTE merge without ClickHouse if/maxIf', () => {
    const spans = { sql: 'SELECT 1 AS sessionId', params: {} };
    const recordings = { sql: 'SELECT 2 AS sessionId', params: {} };
    const cte = buildSessionsCtesCouchbase({
      name: 'sessions',
      spans,
      recordings,
      withActivityFilter: true,
    });
    expect(cte.sql).toContain('CASE WHEN SUM(rumRows) > 0');
    expect(cte.sql).toContain('MAX(CASE WHEN fromReplay = 0 THEN maxTs END)');
    expect(cte.sql).toContain("IFNULL(MAX(email), '')");
    expect(cte.sql).not.toContain('maxIf(');
    expect(cte.sql).not.toMatch(/\bif\(/);
  });

  it('unions session ids without UNION DISTINCT', () => {
    const a = { sql: "SELECT 'a' AS sessionId", params: {} };
    const b = { sql: "SELECT 'b' AS sessionId", params: {} };
    const sql = unionSessionIdsCouchbase(a, b).sql;
    expect(sql).toContain('UNION');
    expect(sql).not.toContain('UNION DISTINCT');
  });

  it('maps rrweb helpers to SQL++', () => {
    expect(rrwebBodyTypeExpr('Body')).toContain('DECODE_JSON(Body)');
    expect(toUInt64OrZeroCouchbase('x')).toBe('IFNULL(TONUMBER(x), 0)');
    expect(ifNonEmptyCouchbase('a', 'b')).toContain('CASE WHEN');
  });

  it.each([true, false])(
    'aliases every FROM subquery (recordings: %s)',
    withRecordings => {
      const cte = buildSessionsCtesCouchbase({
        name: 'sessions',
        spans: { sql: 'SELECT 1 AS sessionId', params: {} },
        recordings: withRecordings
          ? { sql: 'SELECT 2 AS sessionId', params: {} }
          : undefined,
        withActivityFilter: false,
      });
      // SQL++ error 3000: "Subquery in FROM clause must have an alias".
      expect(cte.sql).toMatch(/FROM \([\s\S]*\) AS merged\s+GROUP BY svc, sid/);
    },
  );

  it('aliases both subqueries in the session id union', () => {
    const a = { sql: "SELECT 'a' AS sessionId", params: {} };
    const b = { sql: "SELECT 'b' AS sessionId", params: {} };
    const sql = unionSessionIdsCouchbase(a, b).sql;
    expect(sql).toBe(
      "SELECT sessionId FROM (SELECT 'a' AS sessionId) AS rum_ids UNION SELECT sessionId FROM (SELECT 'b' AS sessionId) AS otel_ids",
    );
  });

  it.each([
    [
      true,
      'HAVING MAX(fromReplay) = 1 OR SUM(interactions) > 0 OR SUM(recordInits) > 0',
    ],
    [false, 'HAVING SUM(interactions) > 0 OR SUM(recordInits) > 0'],
  ])(
    'filters activity on aggregates, not select aliases (recordings: %s)',
    (withRecordings, having) => {
      // SQL++ resolves a HAVING alias as a field of `merged` (4210).
      const cte = buildSessionsCtesCouchbase({
        name: 'sessions',
        spans: { sql: 'SELECT 1 AS sessionId', params: {} },
        recordings: withRecordings
          ? { sql: 'SELECT 2 AS sessionId', params: {} }
          : undefined,
        withActivityFilter: true,
      });
      expect(cte.sql).toContain(having);
    },
  );
});
