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
    expect(new Set(refs)).toEqual(new Set(Object.keys(params)));
    expect(Object.keys(params).length).toBeGreaterThanOrEqual(4);
    const [server, client] = sql.split('ClientSpans AS');
    const names = (s: string) =>
      new Set([...s.matchAll(/\$(p\d+)\b/g)].map(m => m[1]));
    const shared = [...names(server)].filter(n => names(client).has(n));
    expect(shared).toEqual([]);
  });
});
