import {
  durationMsExpr,
  elapsedMinutesExpr,
  groupArrayExpr,
  groupByCell,
  jsonExtractString,
  mapKeyAccess,
  spanExceptionAttributesExpr,
  spanRowIdExpr,
  stringLiteralExpr,
  tupleElementExpr,
  uuidExpr,
  zipSeriesSqlpp,
} from '@/couchbase/dialectExpr';

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

  describe('elapsedMinutesExpr', () => {
    const start = new Date('2026-01-01T00:00:00.000Z');
    const end = new Date('2026-01-01T01:00:59.999Z');

    it('is the whole minutes between two instants for couchbase', () => {
      // age('mi', …) counts whole elapsed minutes.
      expect(elapsedMinutesExpr(start, end, 'couchbase')).toBe('60');
    });

    it('keeps the ClickHouse age() form', () => {
      expect(elapsedMinutesExpr(start, end, 'clickhouse')).toBe(
        "age('mi', toDateTime(1767225600), toDateTime(1767229259.999))",
      );
    });
  });
  describe('groupByCell', () => {
    it('reads the ClickHouse arrayElement column', () => {
      const row = { "arrayElement(ResourceAttributes, 'k8s.pod.name')": 'p1' };
      expect(groupByCell(row, 'ResourceAttributes', 'k8s.pod.name')).toBe('p1');
    });

    it('reads the SQL++ expression-text column', () => {
      const row = { "ResourceAttributes['k8s.pod.name']": 'p2' };
      expect(groupByCell(row, 'ResourceAttributes', 'k8s.pod.name')).toBe('p2');
    });

    it('is empty when the key is missing', () => {
      expect(groupByCell({}, 'ResourceAttributes', 'k8s.pod.name')).toBe('');
    });
  });
  describe('spanExceptionAttributesExpr', () => {
    it('keeps the ClickHouse Nested index form', () => {
      expect(spanExceptionAttributesExpr('Events')).toBe(
        "Events.Attributes[indexOf(Events.Name, 'exception')]",
      );
    });

    it('selects the first exception event over the event array', () => {
      expect(spanExceptionAttributesExpr('Events', 'couchbase')).toBe(
        "IFMISSINGORNULL(FIRST e.`Attributes` FOR e IN Events WHEN e.`Name` = 'exception' END, {})",
      );
    });
  });
  describe('session span columns', () => {
    it('converts a duration to milliseconds', () => {
      expect(durationMsExpr('Duration', 9, 'couchbase')).toBe(
        'IFMISSINGORNULL(TONUMBER(Duration), 0) * 1000 / POWER(10, 9)',
      );
      expect(durationMsExpr('Duration', 9)).toBe(
        'toFloat64OrZero(toString(Duration)) * pow(10, 3) / pow(10, toInt8OrZero(toString(9)))',
      );
    });

    it('builds a span row id without cityHash64 on couchbase', () => {
      const ids: [string, string, string] = [
        'TraceId',
        'ParentSpanId',
        'SpanId',
      ];
      expect(spanRowIdExpr(ids, 'couchbase')).toBe(
        "CONCAT2(':', IFMISSINGORNULL(TOSTRING(TraceId), ''), IFMISSINGORNULL(TOSTRING(ParentSpanId), ''), IFMISSINGORNULL(TOSTRING(SpanId), ''))",
      );
      expect(spanRowIdExpr(ids)).toBe(
        'toString(cityHash64(TraceId, ParentSpanId, SpanId))',
      );
    });

    it('quotes a constant string column', () => {
      expect(stringLiteralExpr("it's", 'couchbase')).toBe("'it''s'");
      expect(stringLiteralExpr('span')).toBe("CAST('span', 'String')");
    });
  });
});
