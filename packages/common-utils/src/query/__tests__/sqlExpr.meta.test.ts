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
    // Parser placeholder for META — must not be treated as a real expr for WITH.
    expect(map.__cbt_id === undefined || map.__cbt_id === '__cbt_meta_id').toBe(
      true,
    );
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

  it('parses SQL++ field access on a function result (/kubernetes events)', () => {
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    const map = sqlExprToAliasMap({
      sql:
        'SELECT Timestamp AS `Timestamp`, ' +
        'TOSTRING(DECODE_JSON(`LogAttributes`.`object`).`type`) AS `Severity`, ' +
        'TOSTRING(DECODE_JSON(`LogAttributes`.`object`).`regarding`.`kind`) AS `Kind` ' +
        'FROM `otel`.`default`.`otel_logs` AS d ORDER BY `Timestamp` DESC',
      params: {},
    });
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
    expect(map.Severity).toBe(
      'TOSTRING(DECODE_JSON(`LogAttributes`.`object`).`type`)',
    );
    expect(map.Kind).toBe(
      'TOSTRING(DECODE_JSON(`LogAttributes`.`object`).`regarding`.`kind`)',
    );
  });
});
