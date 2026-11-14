import { readFileSync } from 'node:fs';

import {
  CouchbaseSearchBuilder,
  type CouchbaseSerializerOptions,
} from '@/couchbase/serializer';
import { sqlpp } from '@/couchbase/sqlpp';
import {
  parseGranularity,
  timeBucketExpr,
  timeRangePredicate,
  toIso30,
} from '@/couchbase/time';

const columns = [
  { name: 'ServiceName', type: 'String' },
  { name: 'SeverityNumber', type: 'UInt8' },
  { name: 'LogAttributes', type: 'Map(String, String)' },
  { name: 'ResourceAttributesJSON', type: 'JSON' },
  { name: 'Body', type: 'String' },
  { name: 'Timestamp', type: "DateTime64(9, 'UTC')" },
  { name: 'TraceId', type: 'String' },
  { name: '__hdx_materialized_k8s.pod.name', type: 'String' },
  { name: 'SpanAttributes', type: 'Map(String, Nullable(String))' },
  { name: 'Events', type: 'Array(JSON)' },
];

function opts(
  extra: Partial<CouchbaseSerializerOptions> = {},
): CouchbaseSerializerOptions {
  return {
    metadata: { getColumns: async () => columns },
    tc: {
      connectionId: 'c',
      databaseName: 'otel',
      scopeName: 'default',
      tableName: 'otel_logs',
    },
    alias: 'd',
    implicitColumnExpression: 'Body',
    bodyExpression: 'd.`Body`',
    searchIndexName: 'fts_otel_logs',
    searchFields: ['Body', 'ServiceName'],
    ...extra,
  };
}

async function where(
  query: string,
  extra?: Partial<CouchbaseSerializerOptions>,
) {
  return new CouchbaseSearchBuilder(query, opts(extra)).build();
}

describe('lucene predicates', () => {
  it('compares a string field with a parameter', async () => {
    const q = await where('ServiceName:"api"');
    expect(q.statement).toContain('d.`ServiceName` = $p0');
    expect(q.parameters.p0).toBe('api');
  });

  it('uses the phase 5 map-key index expression', async () => {
    const q = await where('LogAttributes.http.method:"GET"');
    const index = readFileSync(
      require.resolve('../../../../ingest/src/model/collections.ts'),
      'utf8',
    );
    const fragment = '(p.`name` || "=" || p.`val`)';
    expect(index).toContain(fragment);
    expect(q.statement).toContain(fragment);
    expect(q.parameters.p0).toBe('http.method=GET');
  });

  it('prefers an exact column over a dotted prefix', async () => {
    const q = await where('__hdx_materialized_k8s.pod.name:"web"');
    expect(q.statement).toContain('d.`__hdx_materialized_k8s.pod.name` = $p0');
    expect(q.statement).not.toContain('OBJECT_PAIRS');
  });

  it('escapes like wildcards and rejects a backtick in a map key', async () => {
    const like = await where('ServiceName:*a%b*');
    expect(like.statement).toContain('ESCAPE "\\\\"');
    expect(like.parameters.p0).toBe('%a\\%b%');
    const bad = await where('LogAttributes.a`b:x');
    expect(bad.statement).toContain('FALSE');
  });

  it('renumbers serializer parameters inside a larger statement', async () => {
    const built = await where('ServiceName:"api"');
    const outer = sqlpp`SELECT * FROM d WHERE ${built} AND d.\`TraceId\` = ${{ Param: 'abc' }}`;
    expect(outer.statement).not.toContain('$s');
    expect(outer.parameters.p0).toBe('api');
    expect(Object.values(outer.parameters)).toContain('abc');
  });

  it('renders a numeric equality and a timestamp range', async () => {
    const num = await where('SeverityNumber:3');
    expect(num.parameters.p0).toBe(3);
    const range = await where(
      'Timestamp:[2020-01-01T00:00:00.000Z TO 2020-01-02T00:00:00.000Z]',
    );
    expect(range.statement).toContain('>=');
    expect(String(Object.values(range.parameters)[0])).toMatch(
      /2020-01-01T00:00:00\.000000000Z/,
    );
  });
});

describe('time expressions', () => {
  const from = new Date('2020-01-01T00:00:00.000Z');
  const to = new Date('2020-01-02T00:00:00.000Z');

  it('builds range predicates for both timestamp formats', () => {
    const iso = timeRangePredicate('d.`Timestamp`', 'iso8601', from, to);
    expect(iso.statement).toContain('d.`Timestamp` >= $p0');
    expect(iso.parameters.p0).toBe(toIso30(from));
    const epoch = timeRangePredicate('d.`TimeUnix`', 'epoch_millis', from, to, {
      inclusiveEnd: true,
    });
    expect(epoch.statement).toContain('<=');
    expect(epoch.parameters.p0).toBe(from.getTime());
  });

  it('parses every granularity the renderer accepts and buckets it', () => {
    for (const text of [
      '1 second',
      '15 minute',
      '1 hour',
      '1 day',
      '1 week',
      '1 month',
    ]) {
      const g = parseGranularity(text);
      const bucket = timeBucketExpr('d.`Timestamp`', 'iso8601', g);
      expect(bucket.statement).toContain('MILLIS_TO_UTC');
    }
    expect(() => parseGranularity('1 year')).toThrow(/Unsupported granularity/);
  });
});
