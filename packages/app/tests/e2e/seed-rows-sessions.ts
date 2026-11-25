/**
 * Rows the upstream E2E seed writes that the Couchbase seed lacked (D15 and
 * the gaps found alongside it): legacy `rum.sessionId` sessions and their
 * spans, the cross-trace span-link pair, and the parsed-JSON Body log. Same
 * generators and values as upstream `seed-clickhouse.ts`, built as documents.
 */
import { JSON_BODY_LOG, SPAN_LINK_SEED } from './seed-data';

export type SeedRow = Record<string, unknown>;

const iso = (ms: number) => new Date(Math.round(ms)).toISOString();
const spread = (i: number, count: number, startMs: number, spanMs: number) =>
  count > 1 ? startMs + (i / (count - 1)) * spanMs : startMs;

const JSON_BODY_LOG_BODY =
  '{"app.user.currency":"USD","app.checkout.flow":"guest"}';

function spanRow(ms: number, fields: Partial<SeedRow>): SeedRow {
  return {
    Timestamp: iso(ms),
    TraceId: '',
    SpanId: '',
    ParentSpanId: '',
    TraceState: '',
    SpanName: '',
    SpanKind: 'SPAN_KIND_INTERNAL',
    ServiceName: '',
    ResourceAttributes: {},
    ScopeName: '',
    ScopeVersion: '',
    SpanAttributes: {},
    Duration: 0,
    StatusCode: 'STATUS_CODE_OK',
    StatusMessage: '',
    Events: [],
    Links: [],
    ...fields,
  };
}

/** The JSON-Body log for the parsed-JSON "Add to Filters" test (logs). */
export function buildJsonBodyLogRow(seedRef: number): SeedRow {
  return {
    Timestamp: iso(seedRef - 2000),
    TraceId: '',
    SpanId: '',
    TraceFlags: 0,
    SeverityText: 'info',
    SeverityNumber: 0,
    ServiceName: JSON_BODY_LOG.serviceName,
    Body: JSON_BODY_LOG_BODY,
    ResourceSchemaUrl: '',
    ResourceAttributes: {
      'service.name': JSON_BODY_LOG.serviceName,
      environment: 'test',
    },
    ScopeSchemaUrl: '',
    ScopeName: '',
    ScopeVersion: '',
    ScopeAttributes: {},
    LogAttributes: {},
  };
}

/** Producer and consumer spans in separate traces; the consumer links back. */
export function buildSpanLinkTraceRows(seedRef: number): SeedRow[] {
  const { producer, consumer } = SPAN_LINK_SEED;
  // The consumer picks the message up 30 s after the producer: inside both
  // lookup windows (reverse -1h/+24h, forward -24h/+1h).
  return [
    spanRow(seedRef - 60_000, {
      TraceId: producer.traceId,
      SpanId: producer.spanId,
      SpanName: producer.spanName,
      SpanKind: 'SPAN_KIND_PRODUCER',
      ServiceName: producer.serviceName,
      ResourceAttributes: {
        'service.name': producer.serviceName,
        environment: 'test',
      },
      Duration: 12_000_000,
    }),
    spanRow(seedRef - 30_000, {
      TraceId: consumer.traceId,
      SpanId: consumer.spanId,
      SpanName: consumer.spanName,
      SpanKind: 'SPAN_KIND_CONSUMER',
      ServiceName: consumer.serviceName,
      ResourceAttributes: {
        'service.name': consumer.serviceName,
        environment: 'test',
      },
      Duration: 34_000_000,
      // Same shape ingest writes for an OTLP span link.
      Links: [
        {
          TraceId: producer.traceId,
          SpanId: producer.spanId,
          TraceState: '',
          Attributes: { 'link.kind': 'follows_from' },
        },
      ],
    }),
  ];
}

const sessionUser = (i: number) => ({
  userEmail: `test${i % 5}@example.com`,
  userName: `Test User ${i % 5}`,
});

/** Legacy-SDK session rows (`rum.sessionId`) for the sessions collection. */
export function buildLegacySessionRows(
  count: number,
  startMs: number,
  endMs: number,
): SeedRow[] {
  return Array.from({ length: count }, (_, i) => ({
    Timestamp: iso(spread(i, count, startMs, endMs - startMs)),
    TraceId: `trace-${i}`,
    SpanId: '',
    TraceFlags: 0,
    SeverityText: 'INFO',
    SeverityNumber: 0,
    ServiceName: 'browser',
    Body: '{"type":1,"data":"page_view"}',
    ResourceSchemaUrl: '',
    ResourceAttributes: {
      'rum.sessionId': `session-${i}`,
      'service.name': 'browser',
    },
    ScopeSchemaUrl: '',
    ScopeName: '',
    ScopeVersion: '',
    ScopeAttributes: {},
    LogAttributes: {
      'page.url': 'https://example.com/dashboard',
      'user.id': `user-${i % 5}`,
      teamId: 'test-team',
      teamName: 'Test Team',
      ...sessionUser(i),
    },
  }));
}

/**
 * Legacy-SDK session spans for the traces collection: 5-15 events per
 * session, plus a routeChange and a console.error each. Upstream draws the
 * event count from Math.random(); a fixed hash of the index keeps the seed
 * reproducible with the same 5-15 spread.
 */
export function buildLegacySessionSpans(
  count: number,
  startMs: number,
  endMs: number,
): SeedRow[] {
  const rows: SeedRow[] = [];
  for (let i = 0; i < count; i++) {
    const sessionId = `session-${i}`;
    const base = spread(i, count, startMs, endMs - startMs);
    const resource = { 'rum.sessionId': sessionId, 'service.name': 'browser' };
    const team = { teamId: 'test-team-id', teamName: 'Test Team' };
    const events = 5 + ((i * 7) % 10);
    for (let e = 0; e < events; e++) {
      const hasRecording = i % 2 === 0;
      rows.push(
        spanRow(base - e * 10_000, {
          TraceId: `session-trace-${i}-${e}`,
          SpanId: `session-span-${i}-${e}`,
          SpanName: hasRecording && e === 0 ? 'record init' : 'page_view',
          ServiceName: 'browser',
          ResourceAttributes: resource,
          SpanAttributes: {
            component: e % 3 === 0 ? 'user-interaction' : 'page-view',
            'page.url': 'https://example.com/dashboard',
            ...team,
            ...sessionUser(i),
          },
          StatusCode:
            e === 0 && i % 5 === 0 ? 'STATUS_CODE_ERROR' : 'STATUS_CODE_OK',
        }),
      );
    }
    rows.push(
      spanRow(base - 1000, {
        TraceId: `session-nav-${i}`,
        SpanId: `session-nav-span-${i}`,
        SpanName: 'routeChange',
        ServiceName: 'browser',
        ResourceAttributes: resource,
        SpanAttributes: {
          component: 'navigation',
          'location.href': 'https://example.com/dashboard',
          ...team,
          ...sessionUser(i),
        },
      }),
      spanRow(base - 2000, {
        TraceId: `session-err-${i}`,
        SpanId: `session-err-span-${i}`,
        SpanName: 'console.error',
        ServiceName: 'browser',
        ResourceAttributes: resource,
        SpanAttributes: {
          component: 'error',
          message: `E2E test error ${i}`,
          ...team,
          ...sessionUser(i),
        },
        StatusCode: 'STATUS_CODE_ERROR',
      }),
    );
  }
  return rows;
}
