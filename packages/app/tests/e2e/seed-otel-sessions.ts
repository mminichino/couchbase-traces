/**
 * Sessions keyed on `session.id`, as the OpenTelemetry browser SDK sends them.
 * The rest of the session seed uses the legacy SDK's `rum.sessionId`.
 *
 * Couchbase port: the same rows as upstream's generators, built as documents
 * (D15) instead of ClickHouse VALUES tuples.
 */

export type SeedRow = Record<string, unknown>;

export const OTEL_SESSIONS = {
  /** `session.id` only: replay rows and one failed fetch span. */
  newSdk: 'e2e-new-sdk-session',
  /** Both keys with the same value, as after the collector copies one to the other. */
  bothKeys: 'e2e-both-keys-session',
} as const;

const SERVICE = 'browser';
const PAGE_URL = 'http://localhost:8080/';
const iso = (ms: number) => new Date(ms).toISOString();

function logRow(ms: number, fields: Partial<SeedRow>): SeedRow {
  return {
    Timestamp: iso(ms),
    TraceId: '',
    SpanId: '',
    TraceFlags: 0,
    SeverityText: '',
    SeverityNumber: 0,
    ServiceName: SERVICE,
    Body: '',
    ResourceSchemaUrl: '',
    ResourceAttributes: { 'service.name': SERVICE },
    ScopeSchemaUrl: '',
    ScopeName: '',
    ScopeVersion: '',
    ScopeAttributes: {},
    LogAttributes: {},
    ...fields,
  };
}

function replayRows(
  startMs: number,
  resourceAttributes: Record<string, string>,
  sessionId: string,
): SeedRow[] {
  const events = [
    { type: 4, data: { href: PAGE_URL, width: 1280, height: 720 } },
    {
      type: 2,
      data: {
        // rrweb inserts its style rules into <html>, so replay throws without one.
        node: {
          type: 0,
          id: 1,
          childNodes: [
            {
              type: 2,
              tagName: 'html',
              attributes: {},
              id: 2,
              childNodes: [
                {
                  type: 2,
                  tagName: 'head',
                  attributes: {},
                  childNodes: [],
                  id: 3,
                },
                {
                  type: 2,
                  tagName: 'body',
                  attributes: {},
                  childNodes: [],
                  id: 4,
                },
              ],
            },
          ],
        },
        initialOffset: { left: 0, top: 0 },
      },
    },
  ];
  return events.map((event, i) => {
    const timestampMs = startMs + i * 1000;
    return logRow(timestampMs, {
      Body: JSON.stringify({ ...event, timestamp: timestampMs }),
      ResourceAttributes: resourceAttributes,
      ScopeName: 'rum.rr-web',
      LogAttributes: {
        'session.id': sessionId,
        'rr-web.event': `${i + 1}`,
        'rr-web.offset': `${i + 1}`,
        'rr-web.chunk': '1',
        'rr-web.total-chunks': '1',
      },
    });
  });
}

/** Replay rows for the sessions collection. */
export function buildOtelSessionReplayRows(seedRef: number): SeedRow[] {
  const startMs = seedRef - 5 * 60 * 1000;
  return [
    ...replayRows(startMs, { 'service.name': SERVICE }, OTEL_SESSIONS.newSdk),
    ...replayRows(
      startMs,
      { 'rum.sessionId': OTEL_SESSIONS.bothKeys, 'service.name': SERVICE },
      OTEL_SESSIONS.bothKeys,
    ),
  ];
}

function spanRow(ms: number, fields: Partial<SeedRow>): SeedRow {
  return {
    Timestamp: iso(ms),
    TraceId: '',
    SpanId: '',
    ParentSpanId: '',
    TraceState: '',
    SpanName: '',
    SpanKind: 'SPAN_KIND_INTERNAL',
    ServiceName: SERVICE,
    ResourceAttributes: { 'service.name': SERVICE },
    ScopeName: '',
    ScopeVersion: '',
    SpanAttributes: {},
    Duration: 0,
    StatusCode: 'Unset',
    StatusMessage: '',
    Events: [],
    Links: [],
    ...fields,
  };
}

/** Spans for the traces collection. */
export function buildOtelSessionSpans(seedRef: number): SeedRow[] {
  const ms = seedRef - 5 * 60 * 1000 + 500;
  const { newSdk, bothKeys } = OTEL_SESSIONS;
  return [
    spanRow(ms, {
      TraceId: `${newSdk}-trace`,
      SpanId: `${newSdk}-span`,
      SpanName: 'GET',
      SpanKind: 'SPAN_KIND_CLIENT',
      ScopeName: '@opentelemetry/instrumentation-fetch',
      SpanAttributes: {
        'session.id': newSdk,
        'browser.document.url.full': PAGE_URL,
        'url.full': `${PAGE_URL}api/error`,
        'http.request.method': 'GET',
        'http.response.status_code': '500',
        'error.type': '500',
      },
      Duration: 12_000_000,
      StatusCode: 'Error',
    }),
    // url.full, which document-load sets, lists the span on the All tab.
    spanRow(ms, {
      TraceId: `${bothKeys}-trace`,
      SpanId: `${bothKeys}-span`,
      SpanName: 'documentFetch',
      ResourceAttributes: {
        'rum.sessionId': bothKeys,
        'service.name': SERVICE,
      },
      SpanAttributes: {
        'session.id': bothKeys,
        component: 'document-load',
        'url.full': PAGE_URL,
      },
      Duration: 3_000_000,
    }),
  ];
}

// Four dots inside the 12 ms span.
const RESOURCE_TIMING = {
  fetch_start: '1000.5',
  request_start: '1002',
  response_start: '1009',
  response_end: '1011.5',
  duration: '11',
  transfer_size: '558',
  next_hop_protocol: 'http/1.1',
};

/**
 * OTel SDK log events around the +500 ms span, for the logs collection: the
 * click 3 ms before it that triggers its trace, its request timing, a
 * same-document navigation, and a console error.
 */
export function buildOtelSessionLogEvents(seedRef: number): SeedRow[] {
  const at = (offsetMs: number) => seedRef - 5 * 60 * 1000 + offsetMs;
  const { newSdk, bothKeys } = OTEL_SESSIONS;
  const click = (sessionId: string) =>
    logRow(at(497), {
      SeverityNumber: 9,
      LogAttributes: {
        'session.id': sessionId,
        'browser.tag_name': 'BUTTON',
        'browser.css_selector': '#root > main > button.checkout',
        'browser.document.url.full': PAGE_URL,
        'browser.element.attributes.testid': 'checkout',
      },
      EventName: 'browser.user_action.click',
    });
  const timing = Object.fromEntries(
    Object.entries(RESOURCE_TIMING).map(([k, v]) => [
      `browser.resource_timing.${k}`,
      v,
    ]),
  );
  return [
    click(newSdk),
    logRow(at(520), {
      TraceId: `${newSdk}-trace`,
      SpanId: `${newSdk}-span`,
      SeverityNumber: 9,
      ScopeName: '@opentelemetry/browser-instrumentation/resource-timing',
      LogAttributes: {
        'session.id': newSdk,
        'browser.document.url.full': PAGE_URL,
        'url.full': `${PAGE_URL}api/error`,
        ...timing,
      },
      EventName: 'browser.resource_timing',
    }),
    logRow(at(700), {
      SeverityNumber: 9,
      LogAttributes: {
        'session.id': newSdk,
        'url.full': `${PAGE_URL}checkout`,
        'browser.document.url.full': `${PAGE_URL}checkout`,
        'browser.navigation.same_document': 'true',
        'browser.navigation.hash_change': 'false',
        'browser.navigation.type': 'push',
      },
      EventName: 'browser.navigation',
    }),
    logRow(at(800), {
      SeverityText: 'error',
      SeverityNumber: 17,
      Body: 'Error: checkout failed',
      LogAttributes: {
        'session.id': newSdk,
        'browser.console.method': 'error',
        'browser.document.url.full': PAGE_URL,
      },
      EventName: 'browser.console',
    }),
    click(bothKeys),
  ];
}
