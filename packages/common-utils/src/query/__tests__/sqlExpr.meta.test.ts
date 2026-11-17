import { sqlExprToAliasMap, sqlExprToResultColumnNames } from '@/query';

describe('sqlExprToResultColumnNames', () => {
  it('returns aliases in select-list order without requiring GROUP BY', () => {
    expect(
      sqlExprToResultColumnNames({
        sql:
          'SELECT ServiceName AS svc, LENGTH(ServiceName) AS len, ' +
          'MIN(SeverityText) AS sev, COUNT(*) AS count ' +
          'FROM t WHERE 1=1',
        params: {},
      }),
    ).toEqual(['svc', 'len', 'sev', 'count']);
  });
});

describe('sqlExprToAliasMap META', () => {
  it('parses aliases when META(d).id is present', () => {
    const map = sqlExprToAliasMap({
      sql: 'SELECT Timestamp, ServiceName AS svc, Body, META(d).id AS `__cbt_id` FROM `otel`.`default`.`e2e_otel_logs` AS d',
      params: {},
    });
    expect(map.svc).toBe('ServiceName');
  });

  it('maps SQL++ auto result names for unaliased expressions', () => {
    const map = sqlExprToAliasMap({
      sql: 'SELECT Timestamp, upper(ServiceName) AS svc, lower(ServiceName), Body FROM t',
      params: {},
    });
    expect(map.svc).toBe('upper(ServiceName)');
    // Bare column refs keep their names; only computed expressions get `$N`.
    expect(map.$1).toBe('lower(ServiceName)');
    expect(map.$2).toBeUndefined();
  });
});
