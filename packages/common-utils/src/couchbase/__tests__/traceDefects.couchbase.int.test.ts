/**
 * D3: the MCP trace tools' SQL++ (trace extent probe, span tree, correlated
 * logs, top time-consuming operations) run on a live cluster, because the
 * upstream statements used ClickHouse `{name:Type}` parameters and functions
 * the query service rejects. Requires port/couchbase-test
 * (CBT_TEST_COUCHBASE_*).
 */
import { clusterCache } from '@/couchbase/node';
import { toIso30 } from '@/couchbase/time';
import {
  correlatedLogsQuery,
  spanTreeQuery,
  traceBreakdownQuery,
  traceExtentQuery,
  type TraceTable,
} from '@/couchbase/traceQueries';

import {
  ensureCollection,
  liveConnection,
  probeLive,
  runSql,
  seed,
} from './liveCluster';

const conn = liveConnection('d3-mcp-trace');
const SPANS = 'd3_spans';
const LOGS = 'd3_logs';
const START = new Date('2026-04-01T10:00:00.000Z');
const END = new Date('2026-04-01T11:00:00.000Z');
const at = (ms: number) => toIso30(new Date(START.getTime() + 600_000 + ms));
const NS = 1_000_000;

const spans: TraceTable = {
  from: { databaseName: 'test', scopeName: 'app', tableName: SPANS },
  timestampValueExpression: 'Timestamp',
};
const logs: TraceTable = {
  from: { databaseName: 'test', scopeName: 'app', tableName: LOGS },
  timestampValueExpression: 'Timestamp',
};
const spanExprs = {
  traceId: 'TraceId',
  spanId: 'SpanId',
  parentSpanId: 'ParentSpanId',
  spanName: 'SpanName',
  spanKind: 'SpanKind',
  duration: 'Duration',
  serviceName: 'ServiceName',
  statusCode: 'StatusCode',
  statusMessage: 'StatusMessage',
  attributes: 'SpanAttributes',
};

function span(
  traceId: string,
  spanId: string,
  parent: string,
  service: string,
  name: string,
  ms: number,
  offset: number,
) {
  return {
    TraceId: traceId,
    SpanId: spanId,
    ParentSpanId: parent,
    ServiceName: service,
    SpanName: name,
    SpanKind: parent ? 'SPAN_KIND_CLIENT' : 'SPAN_KIND_SERVER',
    Duration: ms * NS,
    StatusCode: 'STATUS_CODE_OK',
    StatusMessage: '',
    Timestamp: at(offset),
    SpanAttributes: { 'http.route': '/', 'db.system': 'couchbase' },
  };
}

let live = false;

beforeAll(async () => {
  live = await probeLive(conn, 'MCP trace defects');
  if (!live) return;
  await ensureCollection(SPANS);
  await ensureCollection(LOGS);
  await seed(SPANS, [
    span('t1', 'a', '', 'api', 'GET /', 1000, 0),
    span('t1', 'b', 'a', 'db', 'SELECT', 600, 10),
    span('t1', 'c', 'a', 'db', 'SELECT', 300, 20),
    span('t1', 'd', 'a', 'cache', 'GET', 100, 30),
    span('t2', 'e', '', 'api', 'GET /', 400, 1000),
    span('t2', 'f', 'e', 'db', 'SELECT', 200, 1010),
  ]);
  const log = (TraceId: string, SpanId: string, Body: string, ms: number) => ({
    TraceId,
    SpanId,
    Body,
    SeverityText: 'INFO',
    ServiceName: SpanId === 'b' ? 'db' : 'api',
    Timestamp: at(ms),
  });
  await seed(LOGS, [
    log('t1', 'b', 'query', 15),
    log('t1', 'a', 'start', 1),
    log('t2', 'e', 'other', 1001),
  ]);
}, 120000);

afterAll(async () => {
  await clusterCache.closeAll();
});

const run = (q: { statement: string; parameters: Record<string, unknown> }) =>
  runSql(conn, q.statement, q.parameters);

// The client returns integer results as strings (Int64 JSON encoding); the
// tools read them through Number().
const NUMERIC = new Set([
  'firstSeen',
  'lastSeen',
  'durationMs',
  'total_time_ms',
  'calls',
  'in_parents',
  'p50_ms',
  'p99_ms',
]);
const numeric = (row: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k,
      NUMERIC.has(k) && v != null ? Number(v) : v,
    ]),
  );

const breakdown = (
  extra: Pick<
    Parameters<typeof traceBreakdownQuery>[0],
    'parentFilter' | 'minParentDurationStored'
  >,
) =>
  run(
    traceBreakdownQuery({
      table: spans,
      exprs: spanExprs,
      parentStart: START,
      parentEnd: END,
      childStart: START,
      childEnd: END,
      divisor: NS,
      maxParentTraces: 100,
      topN: 10,
      ...extra,
    }),
  );

describe('D3 MCP trace tools on a live cluster', () => {
  it('probes a trace extent in epoch ms with $tid', async () => {
    if (!live) return;
    const [row] = await run(
      traceExtentQuery({
        table: spans,
        traceIdExpression: 'TraceId',
        traceId: 't1',
        start: START,
        end: END,
      }),
    );
    const base = START.getTime() + 600_000;
    expect(numeric(row)).toEqual({ firstSeen: base, lastSeen: base + 30 });
  });

  it('returns NULL extent for an unknown trace', async () => {
    if (!live) return;
    const [row] = await run(
      traceExtentQuery({
        table: spans,
        traceIdExpression: 'TraceId',
        traceId: 'missing',
        start: START,
        end: END,
      }),
    );
    expect(row).toEqual({ firstSeen: null, lastSeen: null });
  });

  it('fetches the span tree oldest first in the waterfall row shape', async () => {
    if (!live) return;
    const rows = await run(
      spanTreeQuery({
        table: spans,
        exprs: { ...spanExprs, attributes: "SpanAttributes['http.route']" },
        traceId: 't1',
        divisor: NS,
        limit: 3,
        start: START,
        end: END,
      }),
    );
    expect(rows.map(r => r.spanId)).toEqual(['a', 'b', 'c']);
    expect(numeric(rows[0])).toMatchObject({
      parentSpanId: '',
      serviceName: 'api',
      spanName: 'GET /',
      durationMs: 1000,
      timestamp: at(0),
      spanAttributes: '/',
    });
  });

  it('accepts a composite toDate(Timestamp), Timestamp expression', async () => {
    if (!live) return;
    const rows = await run(
      spanTreeQuery({
        table: {
          ...spans,
          timestampValueExpression: 'toDate(Timestamp), Timestamp',
        },
        exprs: spanExprs,
        traceId: 't2',
        divisor: NS,
        limit: 10,
        start: START,
        end: END,
      }),
    );
    expect(rows.map(r => r.spanId)).toEqual(['e', 'f']);
  });

  it('fetches correlated logs by TraceId', async () => {
    if (!live) return;
    const rows = await run(
      correlatedLogsQuery({
        table: logs,
        exprs: {
          traceId: 'TraceId',
          spanId: 'SpanId',
          body: 'Body',
          severityText: 'SeverityText',
          serviceName: 'ServiceName',
        },
        traceId: 't1',
        limit: 10,
        start: START,
        end: END,
      }),
    );
    expect(rows.map(r => [r.spanId, r.body])).toEqual([
      ['a', 'start'],
      ['b', 'query'],
    ]);
  });

  it('ranks child operations under matching parents', async () => {
    if (!live) return;
    const rows = await breakdown({
      parentFilter: "ServiceName = 'api' AND SpanName = 'GET /'",
    });
    expect(rows.map(numeric)).toEqual([
      {
        service: 'db',
        operation: 'SELECT',
        total_time_ms: 1100,
        calls: 3,
        in_parents: 2,
        p50_ms: 300,
        p99_ms: expect.any(Number),
      },
      {
        service: 'cache',
        operation: 'GET',
        total_time_ms: 100,
        calls: 1,
        in_parents: 1,
        p50_ms: 100,
        p99_ms: 100,
      },
    ]);
    expect(Number(rows[0].p99_ms)).toBeGreaterThanOrEqual(590);
  });

  it('applies the parent duration floor', async () => {
    if (!live) return;
    const rows = await breakdown({
      parentFilter: "ServiceName = 'api'",
      minParentDurationStored: 500 * NS,
    });
    // Only t1 (1000 ms) qualifies, so t2's 200 ms SELECT drops out.
    expect(
      rows.map(r => [
        r.operation,
        Number(r.total_time_ms),
        Number(r.in_parents),
      ]),
    ).toEqual([
      ['SELECT', 900, 1],
      ['GET', 100, 1],
    ]);
  });
});
