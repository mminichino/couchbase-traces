import { sqlExprToAliasMap } from '@/query';

describe('sqlExprToAliasMap META', () => {
  it('parses aliases when META(d).id is present', () => {
    const map = sqlExprToAliasMap({
      sql: 'SELECT Timestamp, ServiceName AS svc, Body, META(d).id AS `__cbt_id` FROM `otel`.`default`.`e2e_otel_logs` AS d',
      params: {},
    });
    expect(map.svc).toBe('ServiceName');
  });
});
