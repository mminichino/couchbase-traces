/**
 * R3 (B6): service map node and edge latency on a live cluster, checked against
 * upstream f172a489c818's query. Upstream groups the server/client join by
 * GROUPING SETS ((server, client), (server)) and takes
 * quantiles(0.5, 0.95, 0.99) of the server span duration per set. ClickHouse
 * keeps every sample below 8192 and interpolates linearly, which is what
 * `quantileValue` computes, so the expected rows are derived from the spans
 * here with that reference. The keyspace is swapped for an inline array, so
 * the suite needs no collection. Skipped unless CBT_TEST_COUCHBASE_REQUIRED=1.
 */
import { quantileValue } from '@couchbase-traces/common-utils/dist/couchbase/fn/quantile';

import { LIVE, liveQuery } from '@/couchbase/__fixtures__/liveQuery';
import { getServiceMapQueryCouchbase } from '@/couchbase/serviceMap';
import {
  aggregateServiceMapData,
  spanAggregationRowFromJson,
} from '@/hooks/useServiceMap';
import { makeTraceSource } from '@/llm/__fixtures__/sources';
import { getMetadata } from '@/metadata';

const itLive = LIVE ? it : it.skip;
const KEYSPACE = '`otel`.`default`.`otel_traces`';
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

type Span = {
  TraceId: string;
  SpanId: string;
  ParentSpanId: string;
  ServiceName: string;
  SpanKind: string;
  StatusCode: string;
  Duration?: unknown;
  Timestamp: string;
};

let seq = 0;
const ts = '2026-01-01T00:10:00.000000000Z';
/** A client span in `caller` and the server span it causes in `callee`. */
function call(
  caller: string | null,
  callee: string,
  duration: unknown,
  status = 'Ok',
): Span[] {
  seq += 1;
  const trace = `t${seq}`;
  const server: Span = {
    TraceId: trace,
    SpanId: `s${seq}`,
    ParentSpanId: caller ? `c${seq}` : '',
    ServiceName: callee,
    SpanKind: 'Server',
    StatusCode: status,
    Duration: duration,
    Timestamp: ts,
  };
  if (!caller) return [server];
  return [
    {
      TraceId: trace,
      SpanId: `c${seq}`,
      ParentSpanId: '',
      ServiceName: caller,
      SpanKind: 'Client',
      StatusCode: 'Ok',
      Duration: 1,
      Timestamp: ts,
    },
    server,
  ];
}

const WEB_TO_API = [10, 20, 30, 40, 50, 60, 70];
const WORKER_TO_API = [5, 500, 1000];
const DIRECT_TO_API = [15]; // uninstrumented caller: node-level only
const SPANS: Span[] = [
  ...WEB_TO_API.flatMap((d, i) =>
    call('web', 'api', d, i === 0 ? 'Error' : 'Ok'),
  ),
  ...WORKER_TO_API.flatMap(d => call('worker', 'api', d)),
  ...DIRECT_TO_API.flatMap(d => call(null, 'api', d)),
  // A self-call is dropped by upstream's WHERE from both grouping sets.
  ...call('api', 'api', 99999),
  ...[3, 9].flatMap(d => call('api', 'db', d)),
];

const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
const latency = (xs: number[]) => ({
  p50: quantileValue(sorted(xs), 0.5),
  p95: quantileValue(sorted(xs), 0.95),
  p99: quantileValue(sorted(xs), 0.99),
});

async function runServiceMap(spans: Span[]) {
  const q = await getServiceMapQueryCouchbase({
    source,
    dateRange,
    metadata,
    samplingFactor: 1,
  });
  expect(q.sql.split(KEYSPACE)).toHaveLength(3);
  return liveQuery(q.sql.replaceAll(KEYSPACE, JSON.stringify(spans)), q.params);
}

describe('R3 service map latency on a live cluster', () => {
  itLive('returns upstream node and edge rows with percentiles', async () => {
    const rows = await runServiceMap(SPANS);
    const close = (n: number | null) => expect.closeTo(n ?? NaN, 6);
    const row = (
      server: string,
      client: string | null,
      requestCount: number,
      errorCount: number,
      xs: number[],
    ) => {
      const l = latency(xs);
      return {
        serverServiceName: server,
        clientServiceName: client,
        isNodeLevel: client == null ? 1 : 0,
        requestCount,
        errorCount,
        p50: close(l.p50),
        p95: close(l.p95),
        p99: close(l.p99),
      };
    };
    const API_ALL = [...WEB_TO_API, ...WORKER_TO_API, ...DIRECT_TO_API];
    // Upstream's ORDER BY serverServiceName, isNodeLevel, clientServiceName.
    // The uninstrumented edge sorts first: SQL++ orders MISSING/NULL lowest.
    expect(rows).toEqual([
      expect.objectContaining({
        serverServiceName: 'api',
        isNodeLevel: 0,
        requestCount: 1,
        errorCount: 0,
        p50: 15,
      }),
      row('api', 'web', 7, 1, WEB_TO_API),
      row('api', 'worker', 3, 0, WORKER_TO_API),
      row('api', null, 11, 1, API_ALL),
      row('db', 'api', 2, 0, [3, 9]),
      row('db', null, 2, 0, [3, 9]),
    ]);
    // Node latency is over all callers, not an average of the edges.
    expect(rows[3].p50).toBe(40);
    expect(rows[3].p99).toBeCloseTo(quantileValue(sorted(API_ALL), 0.99)!);
  });

  itLive('feeds the hook the same stats shape as upstream', async () => {
    const services = aggregateServiceMapData(
      (await runServiceMap(SPANS)).map(spanAggregationRowFromJson),
    );
    const api = services.get('api');
    expect(api?.incomingRequests).toEqual({
      totalRequests: 11,
      errorCount: 1,
      errorPercentage: (1 / 11) * 100,
      ...latency([...WEB_TO_API, ...WORKER_TO_API, ...DIRECT_TO_API]),
      hasLatency: true,
    });
    expect(api?.incomingRequestsByClient.get('web')).toMatchObject({
      totalRequests: 7,
      ...latency(WEB_TO_API),
      hasLatency: true,
    });
    expect(services.get('web')?.outgoingRequests).toBe(7);
  });

  itLive(
    'skips non-numeric durations instead of sorting them first',
    async () => {
      const spans = [
        ...[10, 20, 30].flatMap(d => call('web', 'cart', d)),
        ...call('web', 'cart', null),
        ...call('web', 'cart', 'slow'),
        ...call('web', 'cart', undefined),
      ];
      const rows = await runServiceMap(spans);
      for (const r of rows) {
        expect(r).toMatchObject({
          requestCount: 6,
          p50: 20,
          p95: 29,
          p99: 29.8,
        });
      }
    },
  );

  itLive('reports no latency when no span has a numeric duration', async () => {
    const rows = await runServiceMap(call('web', 'cart', 'n/a'));
    expect(rows.map(spanAggregationRowFromJson)).toEqual([
      expect.objectContaining({ isNodeLevel: false, p50: undefined }),
      expect.objectContaining({ isNodeLevel: true, p50: undefined }),
    ]);
  });
});
