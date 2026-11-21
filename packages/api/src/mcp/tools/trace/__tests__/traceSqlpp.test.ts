// D3: the trace tools send SQL++ with named parameters, never ClickHouse
// `{name:Type}` placeholders or functions. Runs both handlers against mocked
// sources and a DataClient that records each statement, so the assertion
// covers exactly what reaches Couchbase.

const mockGetSource = jest.fn();
const mockQuery = jest.fn();
const mockQueryChartConfig = jest.fn();

jest.mock('@/controllers/sources', () => ({
  getSource: (...args: unknown[]) => mockGetSource(...args),
}));
jest.mock('@/mcp/tools/trace/shared', () => {
  const actual = jest.requireActual('@/mcp/tools/trace/shared');
  const client = {
    query: (...args: unknown[]) => mockQuery(...args),
    queryChartConfig: (...args: unknown[]) => mockQueryChartConfig(...args),
  };
  return {
    ...actual,
    requireMcpDataClient: async () => client,
    getMcpDataClient: async () => client,
  };
});
jest.mock('@couchbase-traces/common-utils/dist/dataLayer', () => ({
  getMetadata: () => ({}),
}));

import { findClickhouseOnlyConstructs } from '@couchbase-traces/common-utils/dist/couchbase/clickhouseOnly';
import { SourceKind } from '@couchbase-traces/common-utils/dist/types';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { registerTraceBreakdown } from '@/mcp/tools/trace/breakdown';
import { registerTraceWaterfall } from '@/mcp/tools/trace/waterfall';
import type { RegisterToolFn, ToolResult } from '@/mcp/tools/types';

type Handler = Parameters<RegisterToolFn>[2];

const traceSource = {
  id: 'trace-src',
  kind: SourceKind.Trace,
  connection: 'conn-1',
  from: { databaseName: 'otel', tableName: 'otel_traces' },
  timestampValueExpression: 'Timestamp',
  traceIdExpression: 'TraceId',
  spanIdExpression: 'SpanId',
  parentSpanIdExpression: 'ParentSpanId',
  spanNameExpression: 'SpanName',
  spanKindExpression: 'SpanKind',
  durationExpression: 'Duration',
  durationPrecision: 9,
  serviceNameExpression: 'ServiceName',
  statusCodeExpression: 'StatusCode',
  statusMessageExpression: 'StatusMessage',
  eventAttributesExpression: 'SpanAttributes',
  logSourceId: 'log-src',
};
const logSource = {
  id: 'log-src',
  kind: SourceKind.Log,
  connection: 'conn-1',
  from: { databaseName: 'otel', tableName: 'otel_logs' },
  timestampValueExpression: 'Timestamp',
  traceIdExpression: 'TraceId',
  spanIdExpression: 'SpanId',
  bodyExpression: 'Body',
  severityTextExpression: 'SeverityText',
  serviceNameExpression: 'ServiceName',
};

function handlerFor(register: typeof registerTraceWaterfall): Handler {
  let captured: Handler | undefined;
  const registerTool: RegisterToolFn = (_name, _config, handler) => {
    captured = handler;
  };
  register({
    server: new McpServer({ name: 'test', version: '0.0.0' }),
    context: { teamId: 'team-1', userId: 'user-1' },
    registerTool,
  });
  if (!captured) throw new Error('handler was not registered');
  return captured;
}

function rows(data: unknown[]) {
  return { json: async () => data };
}

const sent = () =>
  mockQuery.mock.calls.map(
    ([args]) =>
      args as { query: string; query_params: Record<string, unknown> },
  );

function expectSqlppWithNamedParams() {
  expect(sent().length).toBeGreaterThan(0);
  for (const { query, query_params } of sent()) {
    expect(findClickhouseOnlyConstructs(query)).toEqual([]);
    expect(query).not.toMatch(/\{\w+:\w+\}/);
    // `otel`.`default`.`otel_x`: every keyspace part is quoted.
    expect(query).toMatch(/FROM `otel`\.`default`\.`otel_(traces|logs)`/);
    const used = [...query.matchAll(/\$([A-Za-z_]\w*)/g)].map(m => m[1]);
    expect([...new Set(used)].sort()).toEqual(Object.keys(query_params).sort());
  }
}

const textOf = (r: ToolResult) => JSON.parse(r.content[0].text);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSource.mockImplementation(async (_team: string, id: string) =>
    id === 'log-src' ? logSource : traceSource,
  );
});

describe('cbt_trace_waterfall SQL++', () => {
  it('probes, fetches spans and correlated logs with $tid', async () => {
    mockQuery.mockImplementation(async ({ query }: { query: string }) => {
      if (query.includes('AS firstSeen')) {
        return rows([{ firstSeen: 1767225600000, lastSeen: 1767225600500 }]);
      }
      if (query.includes('`severityText`')) {
        return rows([
          {
            timestamp: '2026-01-01T00:00:00.000Z',
            severityText: 'INFO',
            body: 'hi',
            serviceName: 'api',
            spanId: 's1',
          },
        ]);
      }
      return rows([
        {
          spanId: 's1',
          parentSpanId: '',
          serviceName: 'api',
          spanName: 'GET /',
          spanKind: 'SPAN_KIND_SERVER',
          // Integer-valued results arrive as strings (Int64 JSON encoding);
          // upstream's Float64 division returned a number.
          durationMs: '5',
          statusCode: 'STATUS_CODE_OK',
          statusMessage: '',
          timestamp: '2026-01-01T00:00:00.000Z',
          spanAttributes: {},
        },
      ]);
    });

    const result = await handlerFor(registerTraceWaterfall)({
      sourceId: 'trace-src',
      traceId: 'abc',
    });

    expect(result.isError).toBeFalsy();
    const output = textOf(result);
    expect(output).toMatchObject({
      traceId: 'abc',
      spanCount: 1,
      logsCount: 1,
      totalDurationMs: 5,
      rootSpan: { durationMs: 5 },
    });
    expect(output.spans[0].durationMs).toBe(5);
    expect(sent()).toHaveLength(3);
    expectSqlppWithNamedParams();
    for (const { query_params } of sent()) {
      expect(query_params.tid).toBe('abc');
    }
    const tree = sent()[1];
    expect(tree.query_params).toMatchObject({ divisor: 1_000_000, limit: 501 });
  });
});

describe('cbt_trace_top_time_consuming_operations SQL++', () => {
  it('sends one SQL++ statement with named parameters', async () => {
    mockQuery.mockResolvedValue(
      rows([
        {
          service: 'db',
          operation: 'SELECT',
          total_time_ms: 1300,
          calls: 2,
          in_parents: 2,
          p50_ms: 650,
          p99_ms: 700,
        },
      ]),
    );

    const result = await handlerFor(registerTraceBreakdown)({
      sourceId: 'trace-src',
      parentFilter: "ServiceName = 'api'",
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-01T01:00:00.000Z',
      minParentDurationMs: 850,
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result).operations[0]).toMatchObject({
      operation: 'SELECT',
      calls: 2,
      inParents: 2,
      shareOfTotalTime: 1,
    });
    expect(sent()).toHaveLength(1);
    expectSqlppWithNamedParams();
    expect(sent()[0].query_params).toMatchObject({
      minParentDuration: 850_000_000,
      maxParentTraces: 100_000,
      topN: 20,
    });
  });

  it('reports an unsupported timestamp expression without querying', async () => {
    mockGetSource.mockResolvedValue({
      ...traceSource,
      timestampValueExpression: 'toStartOfHour(Timestamp)',
    });
    const result = await handlerFor(registerTraceBreakdown)({
      sourceId: 'trace-src',
      parentFilter: "ServiceName = 'api'",
      startTime: '2026-01-01T00:00:00.000Z',
      endTime: '2026-01-01T01:00:00.000Z',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain(
      'Unsupported timestamp expression',
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
