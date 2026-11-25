import {
  linkedSpanPairsWhere,
  reverseSpanLinksWhere,
} from '@/couchbase/linkedSpansWhere';

describe('linkedSpansWhere', () => {
  it('matches a link pair over the Links array on couchbase', () => {
    expect(reverseSpanLinksWhere('Links', 't1', 's1', 'couchbase')).toBe(
      "ANY l IN Links SATISFIES l.`TraceId` = 't1' AND l.`SpanId` = 's1' END",
    );
  });

  it('keeps the Nested has/arrayExists form for clickhouse', () => {
    expect(reverseSpanLinksWhere('Links', 't1', 's1', 'clickhouse')).toBe(
      "has(Links.SpanId, 's1') AND arrayExists((lt, ls) -> lt = 't1' AND ls = 's1', Links.TraceId, Links.SpanId)",
    );
  });

  it('expands pair IN into ORs on couchbase', () => {
    expect(
      linkedSpanPairsWhere(
        'TraceId',
        'SpanId',
        [
          ['t1', 's1'],
          ['t2', 's2'],
        ],
        'couchbase',
      ),
    ).toBe(
      "TraceId IN ['t1', 't2'] AND ((TraceId = 't1' AND SpanId = 's1') OR (TraceId = 't2' AND SpanId = 's2'))",
    );
  });

  it('keeps the tuple IN for clickhouse', () => {
    expect(
      linkedSpanPairsWhere('TraceId', 'SpanId', [['t1', 's1']], 'clickhouse'),
    ).toBe("TraceId IN ('t1') AND (TraceId, SpanId) IN (('t1', 's1'))");
  });
});
