/**
 * E2E test data generators and constants shared by Couchbase seeding and specs.
 */
// Test data constants (exported for E2E tests to pick visible filter values)
export const SEVERITIES = ['info', 'warn', 'error', 'debug'] as const;
export const SERVICES = [
  'api-server',
  'frontend',
  'CartService',
  'worker',
  'database',
  'accounting',
  'ad',
  'payment-service',
  'notification-service',
  'inventory-service',
] as const;
// Rows seeded into `otel_logs_interesting_filter_keys`. Each column has a
// distinct value per row so a single filter value matches exactly one row.
// Exported so the filter-key edge case E2E test asserts against the same data.
export const INTERESTING_FILTER_KEYS_ROWS = [
  {
    serviceName: 'service1',
    resourceAttrValue: 'value1',
    jsonValue: 'value1',
    // Top-level JSON key that is NOT a bare identifier (`@` prefix). Selecting
    // it (`ResourceAttributesJSON.`@request_id``) and opening the row must keep
    // the key backtick-quoted in the detail WHERE clause (HDX-5867).
    jsonAtKeyValue: 'request-A',
    clusterName: 'cluster1',
    serviceNameHyphen: 'svc-one',
    mapHyphenValue: 'mapval1',
    jsonHyphenValue: 'jsonval1',
    body: 'log body 1',
  },
  {
    serviceName: 'service2',
    resourceAttrValue: 'value2',
    jsonValue: 'value2',
    jsonAtKeyValue: 'request-B',
    clusterName: 'cluster2',
    serviceNameHyphen: 'svc-two',
    mapHyphenValue: 'mapval2',
    jsonHyphenValue: 'jsonval2',
    body: 'log body 2',
  },
  {
    serviceName: 'service3',
    resourceAttrValue: 'value3',
    jsonValue: 'value3',
    jsonAtKeyValue: 'request-C',
    clusterName: 'cluster3',
    serviceNameHyphen: 'svc-three',
    mapHyphenValue: 'mapval3',
    jsonHyphenValue: 'jsonval3',
    body: 'log body 3',
  },
] as const;

// The at-prefixed JSON key seeded into `ResourceAttributesJSON`. Exported so the
// row-details spec selects and asserts against the same key/values.
export const INTERESTING_FILTER_KEYS_JSON_AT_KEY = '@request_id';

// A single log whose Body is a JSON string with a flat, dotted key. It lives in
// the default E2E Logs table (so it shares the E2E Logs source); the unique
// ServiceName isolates it from other default-logs tests, which all scope by
// their own markers. The parsed-JSON "Add to Filters" test expands this Body
// and filters on the nested value, exercising the JSONExtractString(...) filter
// key path (HDX-4427).
export const JSON_BODY_LOG = {
  // Underscores, not hyphens: Lucene matches an underscore token exactly inside
  // quotes, so `ServiceName:"json_body_filter_svc"` isolates this one row. A
  // hyphenated name tokenizes and matches broadly.
  serviceName: 'json_body_filter_svc',
  jsonKey: 'app.user.currency',
  jsonValue: 'USD',
} as const;
// LogAttributes map key seeded into the metadata-MV source rows. Exported so
// the filter-key edge case test references the same key when building filters.
export const METADATA_MV_LOG_ATTR_KEY = 'requestId';
// Rows seeded into `e2e_otel_logs_metadata_mv` (the metadata-MV-backed source).
// Each row has a distinct ServiceName and LogAttributes['requestId'] value so a
// single filter value matches exactly one row, mirroring the
// INTERESTING_FILTER_KEYS_ROWS shape. Facet keys/values for this source come
// from the rollup MVs rather than the base table.
export const METADATA_MV_ROWS = [
  {
    serviceName: 'mv-service-1',
    logAttrValue: 'mv-req-1',
    body: 'mv log body 1',
  },
  {
    serviceName: 'mv-service-2',
    logAttrValue: 'mv-req-2',
    body: 'mv log body 2',
  },
  {
    serviceName: 'mv-service-3',
    logAttrValue: 'mv-req-3',
    body: 'mv log body 3',
  },
] as const;

// Service (`AppName`) values seeded into `e2e_custom_service_name`.
export const CUSTOM_SERVICE_LOGS_APP_NAMES = [
  'checkout-app',
  'payments-app',
  'inventory-app',
  'auth-app',
] as const;

// Body templates for `e2e_custom_service_name`.
export const CUSTOM_SERVICE_LOG_MESSAGES = [
  'Started request handler for endpoint',
  'Completed background reconciliation loop for object',
  'Cache lookup finished for entry',
  'Connection pool statistics reported for shard',
] as const;

const LOG_MESSAGES = [
  'Request processed successfully',
  'Database connection established',
  'Cache hit for key',
  'User authentication successful',
  'Background info job completed',
  'Health check passed',
  'Configuration loaded',
  'Metrics exported',
  'Order created',
  'Order info updated',
  'Order deleted',
  'Order info fetched',
  'Order listed',
  'Order searched',
  'Order canceled',
  'Order completed',
  'Order info refunded',
] as const;
const SPAN_NAMES = [
  'GET /api/logs',
  'POST /api/traces',
  'AddItem',
  'database.query',
  'http.request',
  'cache.get',
  'auth.verify',
  'Order create',
  'Order update',
] as const;
const SPAN_KINDS = [
  'SPAN_KIND_SERVER',
  'SPAN_KIND_CLIENT',
  'SPAN_KIND_INTERNAL',
  'SPAN_KIND_PRODUCER',
  'SPAN_KIND_CONSUMER',
  'SPAN_KIND_UNSPECIFIED',
] as const;

// Time window for seeded data: past + future so "last N minutes" finds data after seed
const PAST_MS = 60 * 60 * 1000; // 1 hour
const FUTURE_MS =
  (process.env.E2E_SEED_FUTURE_MS &&
    parseInt(process.env.E2E_SEED_FUTURE_MS, 10)) ||
  2 * 60 * 60 * 1000; // 2 hours default

export function getE2eSeedWindow() {
  const seedRef = Date.now();
  return {
    seedRef,
    startMs: seedRef - PAST_MS,
    endMs: seedRef + FUTURE_MS,
    numDataPoints: 500,
  };
}

export type E2eClickHouseRow = Record<string, unknown>;

export function buildE2eMainLogRows(
  count: number,
  startMs: number,
  endMs: number,
): E2eClickHouseRow[] {
  const rows: E2eClickHouseRow[] = [];
  const span = endMs - startMs;

  for (let i = 0; i < count; i++) {
    const t = count > 1 ? startMs + (i / (count - 1)) * span : startMs;
    const timestampNs = Math.round(t) * 1_000_000;
    const severity = SEVERITIES[i % SEVERITIES.length];
    const service = SERVICES[i % SERVICES.length];
    const message = LOG_MESSAGES[i % LOG_MESSAGES.length];
    const traceId = i < 10 ? `trace-${i}` : '';

    rows.push({
      Timestamp: new Date(timestampNs / 1_000_000).toISOString(),
      TraceId: traceId,
      SpanId: '',
      TraceFlags: 0,
      SeverityText: severity,
      SeverityNumber: 0,
      ServiceName: service,
      Body: message,
      ResourceSchemaUrl: '',
      ResourceAttributes: {
        'service.name': service,
        environment: 'test',
      },
      ScopeSchemaUrl: '',
      ScopeName: '',
      ScopeVersion: '',
      ScopeAttributes: {},
      LogAttributes: {
        'request.id': `req-${i}`,
        'user.id': `user-${i % 5}`,
      },
    });
  }

  return rows;
}

/**
 * Build the VALUES tuples for `e2e_custom_service_name`. Rows cycle through
 * CUSTOM_SERVICE_LOGS_APP_NAMES and CUSTOM_SERVICE_LOG_MESSAGES so every Drain pattern's
 * samples span multiple services. Spread across the seed window like the other
 * log data so relative time ranges find them.
 */
export function buildE2eCustomServiceLogRows(
  count: number,
  startMs: number,
  endMs: number,
): E2eClickHouseRow[] {
  const rows: E2eClickHouseRow[] = [];
  const span = endMs - startMs;

  for (let i = 0; i < count; i++) {
    const t = count > 1 ? startMs + (i / (count - 1)) * span : startMs;
    const timestampNs = Math.round(t) * 1_000_000;
    const appName =
      CUSTOM_SERVICE_LOGS_APP_NAMES[i % CUSTOM_SERVICE_LOGS_APP_NAMES.length];
    const severity = SEVERITIES[i % SEVERITIES.length];
    const message = `${CUSTOM_SERVICE_LOG_MESSAGES[i % CUSTOM_SERVICE_LOG_MESSAGES.length]} ${i}`;
    rows.push({
      Timestamp: new Date(timestampNs / 1_000_000).toISOString(),
      AppName: appName,
      SeverityText: severity,
      Body: message,
      LogAttributes: { level: severity },
    });
  }

  return rows;
}

export function buildE2eTraceRows(
  count: number,
  startMs: number,
  endMs: number,
): E2eClickHouseRow[] {
  const rows: E2eClickHouseRow[] = [];
  const spansPerTrace = 4;
  const numTraces = Math.ceil(count / spansPerTrace);
  const span = endMs - startMs;

  for (let traceIdx = 0; traceIdx < numTraces; traceIdx++) {
    const traceId = `trace-${traceIdx}`;
    const traceAnchor =
      numTraces > 1 ? startMs + (traceIdx / (numTraces - 1)) * span : startMs;
    const traceStartTime = traceAnchor;

    for (let spanIdx = 0; spanIdx < spansPerTrace; spanIdx++) {
      const spanId = `span-${traceIdx}-${spanIdx}`;
      const parentSpanId =
        spanIdx === 0 ? '' : `span-${traceIdx}-${spanIdx - 1}`;
      const timestampNs = (traceStartTime - spanIdx * 100) * 1_000_000;
      const service = SERVICES[spanIdx % SERVICES.length];
      const spanName = SPAN_NAMES[rows.length % SPAN_NAMES.length];
      const spanKind =
        spanIdx === 0
          ? 'SPAN_KIND_SERVER'
          : SPAN_KINDS[spanIdx % SPAN_KINDS.length];
      const isError = traceIdx % 10 === 0 && spanIdx === 0;
      const statusCode = isError ? 'STATUS_CODE_ERROR' : 'STATUS_CODE_OK';
      const httpStatusCode = isError ? '500' : '200';
      const duration =
        ((rows.length * 17) % 500) * 1_000_000 +
        (spansPerTrace - spanIdx) * 100_000_000;

      rows.push({
        Timestamp: new Date(timestampNs / 1_000_000).toISOString(),
        TraceId: traceId,
        SpanId: spanId,
        ParentSpanId: parentSpanId,
        TraceState: '',
        SpanName: spanName,
        SpanKind: spanKind,
        ServiceName: service,
        ResourceAttributes: {
          'service.name': service,
          environment: 'test',
          // Enough for the Infrastructure tab gate (k8s.pod.uid).
          'k8s.pod.uid': `pod-uid-${rows.length}`,
          'k8s.pod.name': `pod-${service}`,
        },
        ScopeName: '',
        ScopeVersion: '',
        SpanAttributes: {
          'http.method': 'GET',
          'http.status_code': httpStatusCode,
        },
        Duration: duration,
        StatusCode: statusCode,
        StatusMessage: '',
        Events: [],
        Links: [],
      });

      if (rows.length >= count) {
        return rows;
      }
    }
  }

  return rows;
}

// Cross-trace span-link pair: a consumer span in its own trace whose Links
// reference a producer span in another trace. Exercises both directions of
// span-link resolution in the span detail panel (resolved "Span Links"
// details and the reverse "Linked from" section). Exported so specs can
// search for these spans by name.
export const SPAN_LINK_SEED = {
  producer: {
    traceId: 'e2e-link-producer-trace',
    spanId: 'e2e-link-producer-span',
    spanName: 'E2E Link Producer Publish',
    serviceName: 'link-producer-svc',
  },
  consumer: {
    traceId: 'e2e-link-consumer-trace',
    spanId: 'e2e-link-consumer-span',
    spanName: 'E2E Link Consumer Process',
    serviceName: 'link-consumer-svc',
  },
} as const;
