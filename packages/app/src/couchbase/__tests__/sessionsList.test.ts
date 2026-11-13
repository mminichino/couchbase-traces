import {
  buildSessionsCtesCouchbase,
  ifNonEmptyCouchbase,
  rrwebBodyTypeExpr,
  toUInt64OrZeroCouchbase,
  unionSessionIdsCouchbase,
} from '../sessionsList';

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
    expect(cte.sql).toContain('IFNULL(MAX(email), \'\')');
    expect(cte.sql).not.toContain('maxIf(');
    expect(cte.sql).not.toMatch(/\bif\(/);
  });

  it('unions session ids without UNION DISTINCT', () => {
    const a = { sql: 'SELECT \'a\' AS sessionId', params: {} };
    const b = { sql: 'SELECT \'b\' AS sessionId', params: {} };
    const sql = unionSessionIdsCouchbase(a, b).sql;
    expect(sql).toContain('UNION');
    expect(sql).not.toContain('UNION DISTINCT');
  });

  it('maps rrweb helpers to SQL++', () => {
    expect(rrwebBodyTypeExpr('Body')).toContain('DECODE_JSON(Body)');
    expect(toUInt64OrZeroCouchbase('x')).toBe('IFNULL(TONUMBER(x), 0)');
    expect(ifNonEmptyCouchbase('a', 'b')).toContain('CASE WHEN');
  });
});
