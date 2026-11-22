import {
  rewriteInSubqueriesToRaw,
  rewriteSqlInValueLists,
} from '@/couchbase/sqlInLists';

describe('rewriteSqlInValueLists', () => {
  it('rewrites a single-value IN list to SQL++ array form', () => {
    expect(rewriteSqlInValueLists("ServiceName IN ('accounting')")).toBe(
      "ServiceName IN ['accounting']",
    );
  });

  it('rewrites multi-value and NOT IN lists', () => {
    expect(
      rewriteSqlInValueLists(
        "ServiceName IN ('api', 'web') AND x NOT IN ('a')",
      ),
    ).toBe("ServiceName IN ['api', 'web'] AND x NOT IN ['a']");
  });

  it('leaves IN (SELECT …) subqueries alone', () => {
    const sql = 'id IN (SELECT RAW sid FROM sessions)';
    expect(rewriteSqlInValueLists(sql)).toBe(sql);
  });

  it('rewrites NULL empty-selection lists', () => {
    expect(rewriteSqlInValueLists('Env IN (true, false)')).toBe(
      'Env IN [true, false]',
    );
    expect(rewriteSqlInValueLists('ServiceName IN (NULL)')).toBe(
      'ServiceName IN [NULL]',
    );
  });
});

// SQL++ `SELECT x` yields objects ({"x": …}); IN compares the left value with
// each object and never matches. `SELECT RAW x` yields the values themselves.
describe('rewriteInSubqueriesToRaw', () => {
  it.each([
    [
      'x IN (SELECT sessions.sessionId FROM sessions)',
      'x IN (SELECT RAW sessions.sessionId FROM sessions)',
    ],
    [
      'x NOT IN ( select `s`.`sid` from s WHERE a = 1)',
      'x NOT IN ( select RAW `s`.`sid` from s WHERE a = 1)',
    ],
    [
      'x IN (SELECT DISTINCT sid FROM s)',
      'x IN (SELECT DISTINCT RAW sid FROM s)',
    ],
  ])('%s', (input, expected) => {
    expect(rewriteInSubqueriesToRaw(input)).toBe(expected);
  });

  it.each([
    'x IN (SELECT RAW sid FROM s)',
    'x IN (SELECT DISTINCT RAW sid FROM s)',
    'x IN (SELECT VALUE sid FROM s)',
    // Several columns or an aliased column keep their object shape.
    'x IN (SELECT a, b FROM s)',
    'x IN (SELECT a AS b FROM s)',
    'x IN (SELECT * FROM s)',
    "x IN ['a']",
    "y = 'IN (SELECT a FROM s)'",
  ])('leaves %s alone', sql => {
    expect(rewriteInSubqueriesToRaw(sql)).toBe(sql);
  });
});
