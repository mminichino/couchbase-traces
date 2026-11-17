import { rewriteSqlInValueLists } from '@/couchbase/sqlInLists';

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
