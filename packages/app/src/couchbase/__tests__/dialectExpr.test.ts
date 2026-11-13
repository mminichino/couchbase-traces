import {
  groupArrayExpr,
  jsonExtractString,
  mapKeyAccess,
  tupleElementExpr,
  uuidExpr,
  zipSeriesSqlpp,
} from '../dialectExpr';

describe('dialectExpr', () => {
  it('maps JSONExtractString to DECODE_JSON for couchbase', () => {
    const access = mapKeyAccess('LogAttributes', 'object', 'couchbase');
    expect(access).toBe('`LogAttributes`.`object`');
    expect(jsonExtractString(access, ['regarding', 'kind'], 'couchbase')).toBe(
      'TOSTRING(DECODE_JSON(`LogAttributes`.`object`).`regarding`.`kind`)',
    );
  });

  it('keeps ClickHouse JSONExtractString', () => {
    expect(
      jsonExtractString("LogAttributes['object']", ['type'], 'clickhouse'),
    ).toBe("JSONExtractString(LogAttributes['object'], 'type')");
  });

  it('maps groupArray / tupleElement / uuid', () => {
    expect(groupArrayExpr('x', 'couchbase')).toBe('ARRAY_AGG(x)');
    expect(tupleElementExpr('zipped', 1, 'couchbase')).toBe('zipped[0]');
    expect(uuidExpr('couchbase')).toBe('UUID()');
  });

  it('builds UNNEST zip SQL++', () => {
    const sql = zipSeriesSqlpp({
      fromTable: 'selected_error_series',
      groupColumn: 'endpoint',
      valuesAlias: 'error_rate',
    });
    expect(sql).toContain('UNNEST ARRAY_RANGE');
    expect(sql).toContain('AS zipped');
    expect(sql).not.toContain('arrayJoin');
  });
});
