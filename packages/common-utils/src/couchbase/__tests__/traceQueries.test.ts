import { findClickhouseOnlyConstructs } from '@/couchbase/clickhouseOnly';
import {
  correlatedLogsQuery,
  spanTreeQuery,
  traceBreakdownQuery,
  traceExtentQuery,
  type TraceTable,
} from '@/couchbase/traceQueries';

// Same source shape the deferred `mcp/__tests__/trace` suite seeds.
const traces: TraceTable = {
  from: { databaseName: 'otel', tableName: 'otel_traces' },
  timestampValueExpression: 'Timestamp',
};
const logs: TraceTable = {
  from: { databaseName: 'otel', scopeName: 'app', tableName: 'otel_logs' },
  timestampValueExpression: 'Timestamp',
};
const start = new Date('2026-01-01T00:00:00.000Z');
const end = new Date('2026-01-01T01:00:00.000Z');

const spanExprs = {
  traceId: 'TraceId',
  spanId: 'SpanId',
  parentSpanId: 'ParentSpanId',
  serviceName: 'ServiceName',
  spanName: 'SpanName',
  spanKind: 'SpanKind',
  duration: 'Duration',
  statusCode: 'StatusCode',
  statusMessage: 'StatusMessage',
  attributes: 'SpanAttributes',
};

/** Every `$name` in the statement has a value, and every value is used. */
function expectBound(q: { statement: string; parameters: object }) {
  const used = new Set(
    [...q.statement.matchAll(/\$([A-Za-z_]\w*)/g)].map(m => m[1]),
  );
  expect([...used].sort()).toEqual(Object.keys(q.parameters).sort());
}

function expectSqlpp(q: { statement: string; parameters: object }) {
  expect(findClickhouseOnlyConstructs(q.statement)).toEqual([]);
  expect(q.statement).not.toMatch(/\{\w+:\w+\}/);
  expectBound(q);
}

describe('traceExtentQuery', () => {
  it('reads the epoch-ms extent of one trace with $tid and a quoted keyspace', () => {
    const q = traceExtentQuery({
      table: traces,
      traceIdExpression: 'TraceId',
      traceId: 'abc',
      start,
      end,
    });
    expectSqlpp(q);
    expect(q.statement).toContain('FROM `otel`.`default`.`otel_traces`');
    expect(q.statement).toContain('TraceId = $tid');
    // Unquoted: the trace suite's probe-failure spy matches 'AS firstSeen'.
    expect(q.statement).toContain('MIN(STR_TO_MILLIS(Timestamp)) AS firstSeen');
    expect(q.statement).toContain('MAX(STR_TO_MILLIS(Timestamp)) AS lastSeen');
    expect(q.parameters).toMatchObject({ tid: 'abc' });
    expect(Object.values(q.parameters)).toEqual(
      expect.arrayContaining([
        '2026-01-01T00:00:00.000000000Z',
        '2026-01-01T01:00:00.000000000Z',
      ]),
    );
  });

  it('passes epoch-millis timestamps through and binds epoch bounds', () => {
    const q = traceExtentQuery({
      table: { ...traces, timestampFormat: 'epoch_millis' },
      traceIdExpression: 'TraceId',
      traceId: 'abc',
      start,
      end,
    });
    expectSqlpp(q);
    expect(q.statement).toContain('MIN(Timestamp) AS firstSeen');
    expect(Object.values(q.parameters)).toEqual(
      expect.arrayContaining([start.getTime(), end.getTime()]),
    );
  });

  it('rejects a keyspace name that contains a backtick', () => {
    expect(() =>
      traceExtentQuery({
        table: { ...traces, from: { databaseName: 'ot`el', tableName: 't' } },
        traceIdExpression: 'TraceId',
        traceId: 'abc',
        start,
        end,
      }),
    ).toThrow(/backtick/);
  });
});

describe('spanTreeQuery', () => {
  it('selects the waterfall row shape with named $tid, $divisor and $limit', () => {
    const q = spanTreeQuery({
      table: traces,
      exprs: spanExprs,
      traceId: 'abc',
      start,
      end,
      divisor: 1_000_000,
      limit: 501,
    });
    expectSqlpp(q);
    for (const alias of [
      'spanId',
      'parentSpanId',
      'serviceName',
      'spanName',
      'spanKind',
      'durationMs',
      'statusCode',
      'statusMessage',
      'timestamp',
      'spanAttributes',
    ]) {
      expect(q.statement).toContain(`AS \`${alias}\``);
    }
    expect(q.statement).toContain('Duration / $divisor AS `durationMs`');
    expect(q.statement).toContain('WHERE TraceId = $tid');
    expect(q.statement).toMatch(/ORDER BY Timestamp ASC\s+LIMIT \$limit$/);
    expect(q.parameters).toMatchObject({
      tid: 'abc',
      divisor: 1_000_000,
      limit: 501,
    });
  });

  it('uses SQL++ defaults for unset expressions and map access for attributes', () => {
    const q = spanTreeQuery({
      table: traces,
      exprs: {
        ...spanExprs,
        serviceName: undefined,
        statusCode: undefined,
        statusMessage: undefined,
        attributes: undefined,
        spanName: "SpanAttributes['http.route']",
      },
      traceId: 'abc',
      start,
      end,
      divisor: 1,
      limit: 10,
    });
    expectSqlpp(q);
    expect(q.statement).toContain("'' AS `serviceName`");
    expect(q.statement).toContain('{} AS `spanAttributes`');
    expect(q.statement).not.toContain('map()');
    expect(q.statement).toContain('SpanAttributes.`http.route` AS `spanName`');
  });

  it('renders an epoch-millis timestamp as an ISO string so spans sort', () => {
    const q = spanTreeQuery({
      table: { ...traces, timestampFormat: 'epoch_millis' },
      exprs: spanExprs,
      traceId: 'abc',
      start,
      end,
      divisor: 1,
      limit: 10,
    });
    expect(q.statement).toContain(
      'MILLIS_TO_UTC(Timestamp, "1111-11-11T11:11:11.111Z") AS `timestamp`',
    );
  });
});

describe('correlatedLogsQuery', () => {
  it('reads log rows of one trace from the log keyspace', () => {
    const q = correlatedLogsQuery({
      table: logs,
      exprs: {
        traceId: 'TraceId',
        spanId: 'SpanId',
        body: 'Body',
        severityText: 'SeverityText',
        serviceName: 'ServiceName',
      },
      traceId: 'abc',
      start,
      end,
      limit: 101,
    });
    expectSqlpp(q);
    expect(q.statement).toContain('FROM `otel`.`app`.`otel_logs`');
    for (const alias of [
      'timestamp',
      'severityText',
      'body',
      'serviceName',
      'spanId',
    ]) {
      expect(q.statement).toContain(`AS \`${alias}\``);
    }
    expect(q.parameters).toMatchObject({ tid: 'abc', limit: 101 });
  });
});

describe('traceBreakdownQuery', () => {
  const base = {
    table: traces,
    exprs: {
      traceId: 'TraceId',
      serviceName: 'ServiceName',
      spanName: 'SpanName',
      duration: 'Duration',
    },
    parentFilter: "ServiceName = 'api' AND SpanName = 'GET /users'",
    parentStart: start,
    parentEnd: end,
    childStart: new Date(start.getTime() - 60_000),
    childEnd: new Date(end.getTime() + 60_000),
    divisor: 1_000_000,
    maxParentTraces: 1000,
    topN: 20,
  };

  it('ranks child operations with SQL++ aggregates and named parameters', () => {
    const q = traceBreakdownQuery(base);
    expectSqlpp(q);
    expect(q.statement).toMatch(
      /^WITH parent_traces AS \(\s*SELECT DISTINCT RAW TraceId\s+FROM `otel`\.`default`\.`otel_traces`/,
    );
    expect(q.statement).toContain('LIMIT $maxParentTraces');
    expect(q.statement).toContain('TraceId IN parent_traces');
    expect(q.statement).toContain(
      "AND NOT (ServiceName = 'api' AND SpanName = 'GET /users')",
    );
    expect(q.statement).toContain(
      'SUM(Duration) / $divisor AS `total_time_ms`',
    );
    expect(q.statement).toContain('COUNT(*) AS `calls`');
    expect(q.statement).toContain('COUNT(DISTINCT TraceId) AS `in_parents`');
    expect(q.statement).toContain('AS `p50_ms`');
    expect(q.statement).toContain('AS `p99_ms`');
    expect(q.statement).toContain('GROUP BY ServiceName, SpanName');
    expect(q.statement).toMatch(
      /ORDER BY `total_time_ms` DESC\s+LIMIT \$topN$/,
    );
    expect(q.statement).not.toContain('$minParentDuration');
    expect(q.parameters).toMatchObject({
      divisor: 1_000_000,
      maxParentTraces: 1000,
      topN: 20,
    });
    // The two quantile levels are separate parameters.
    expect(Object.values(q.parameters)).toEqual(
      expect.arrayContaining([0.5, 0.99]),
    );
  });

  it('binds the parent duration floor in stored units', () => {
    const q = traceBreakdownQuery({ ...base, minParentDurationStored: 850e6 });
    expectSqlpp(q);
    expect(q.statement).toContain('AND Duration >= $minParentDuration');
    expect(q.parameters).toMatchObject({ minParentDuration: 850e6 });
  });

  it('rewrites map subscripts and IN lists in the parent filter', () => {
    const q = traceBreakdownQuery({
      ...base,
      parentFilter: "SpanAttributes['http.route'] IN ('/a', '/b')",
    });
    expectSqlpp(q);
    expect(q.statement).toContain(
      "(SpanAttributes.`http.route` IN ['/a', '/b'])",
    );
  });

  it('filters on every column of a composite timestamp, at day precision for toDate', () => {
    const q = traceBreakdownQuery({
      ...base,
      table: {
        ...traces,
        timestampValueExpression: 'toDate(Timestamp), Timestamp',
      },
    });
    expectSqlpp(q);
    expect(q.statement).not.toMatch(/toDate/i);
    // Day bounds for the Date column, exact bounds for the DateTime column.
    expect(Object.values(q.parameters)).toEqual(
      expect.arrayContaining([
        '2026-01-01T00:00:00.000000000Z',
        '2026-01-02T00:00:00.000000000Z',
        '2026-01-01T01:00:00.000000000Z',
      ]),
    );
  });
});
