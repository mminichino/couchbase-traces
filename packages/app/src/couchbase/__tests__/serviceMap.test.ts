import { findClickhouseOnlyConstructs } from '@couchbase-traces/common-utils/dist/couchbase/clickhouseOnly';

import { getServiceMapQueryCouchbase } from '@/couchbase/serviceMap';
import { makeTraceSource } from '@/llm/__fixtures__/sources';
import { getMetadata } from '@/metadata';

const source = makeTraceSource({
  from: {
    databaseName: 'otel',
    scopeName: 'default',
    tableName: 'otel_traces',
  },
});

const metadata = getMetadata();
jest.spyOn(metadata, 'getColumns').mockResolvedValue([]);
const dateRange: [Date, Date] = [
  new Date('2026-01-01T00:00:00Z'),
  new Date('2026-01-01T01:00:00Z'),
];

describe('getServiceMapQueryCouchbase sampling', () => {
  it('samples by a SQL++ crc32 of the trace id', async () => {
    const { sql } = await getServiceMapQueryCouchbase({
      source,
      dateRange,
      metadata,
      samplingFactor: 10,
    });
    expect(sql).toContain(
      'HASHBYTES(TOSTRING(TraceId), {"algorithm":"crc32"})',
    );
    expect(sql).not.toMatch(/\bCRC32\(/);
    expect(findClickhouseOnlyConstructs(sql)).toEqual([]);
  });

  it('does not sample when the factor is 1', async () => {
    const { sql } = await getServiceMapQueryCouchbase({
      source,
      dateRange,
      metadata,
      samplingFactor: 1,
    });
    expect(sql).not.toContain('HASHBYTES');
  });
});

describe('getServiceMapQueryCouchbase parameters', () => {
  // Both CTEs are rendered separately and each numbers from $p0; merged as-is
  // the client CTE's date bounds would bind to the server CTE's names.
  it('gives each spliced CTE its own parameter names', async () => {
    const { sql, params } = await getServiceMapQueryCouchbase({
      source,
      dateRange,
      metadata,
      samplingFactor: 1,
    });
    const refs = [...sql.matchAll(/\$(p\d+)\b/g)].map(m => m[1]);
    const cteParams = Object.keys(params).filter(k => /^p\d+$/.test(k));
    expect(new Set(refs)).toEqual(new Set(cteParams));
    expect(cteParams.length).toBeGreaterThanOrEqual(4);
    const [server, client] = sql.split('ClientSpans AS');
    const names = (s: string) =>
      new Set([...s.matchAll(/\$(p\d+)\b/g)].map(m => m[1]));
    const shared = [...names(server)].filter(n => names(client).has(n));
    expect(shared).toEqual([]);
  });
});

describe('getServiceMapQueryCouchbase latency (R3)', () => {
  const levels = {
    serviceMapP50: 0.5,
    serviceMapP95: 0.95,
    serviceMapP99: 0.99,
  };

  it('computes node percentiles instead of NULL', async () => {
    const { sql, params } = await getServiceMapQueryCouchbase({
      source,
      dateRange,
      metadata,
      samplingFactor: 1,
    });
    expect(sql).not.toMatch(/NULL AS p(50|95|99)/);
    // One p50/p95/p99 projection per UNION ALL branch: edges and nodes.
    for (const p of ['p50', 'p95', 'p99']) {
      expect(sql.match(new RegExp(`AS ${p}\\b`, 'g'))).toHaveLength(2);
    }
    expect(sql).toContain('node.durs[CEIL(($serviceMapP95');
    expect(sql).toContain('ARRAY_FLATTEN(ARRAY_AGG(edge.durs), 1)');
    expect(params).toMatchObject(levels);
    // Every named parameter in the statement is bound.
    const refs = new Set([...sql.matchAll(/\$(\w+)/g)].map(m => m[1]));
    expect([...refs].filter(r => !(r in params))).toEqual([]);
    expect(findClickhouseOnlyConstructs(sql)).toEqual([]);
  });

  it('drops non-numeric durations before sorting', async () => {
    const { sql } = await getServiceMapQueryCouchbase({
      source,
      dateRange,
      metadata,
      samplingFactor: 1,
    });
    expect(sql).toContain(
      'ARRAY_SORT(ARRAY v FOR v IN ARRAY_AGG(CASE WHEN ISNUMBER(s.duration) THEN s.duration END) WHEN ISNUMBER(v) END) AS durs',
    );
  });

  it('omits latency when the source has no duration expression', async () => {
    const { sql, params } = await getServiceMapQueryCouchbase({
      source: { ...source, durationExpression: '' },
      dateRange,
      metadata,
      samplingFactor: 1,
    });
    expect(sql).not.toMatch(/\bp(50|95|99)\b|durs/);
    expect(Object.keys(params)).not.toContain('serviceMapP50');
  });
});
