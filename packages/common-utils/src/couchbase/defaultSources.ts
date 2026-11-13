/** Default Couchbase source templates (moved from packages/ingest). */
export const COUCHBASE_LOG_SOURCE = {
  from: { databaseName: 'otel', scopeName: 'default', tableName: 'otel_logs' },
  kind: 'log',
  timestampValueExpression: 'Timestamp',
  timestampFormat: 'iso8601',
  searchIndexName: 'fts_otel_logs',
  name: 'Logs',
  displayedTimestampValueExpression: 'Timestamp',
  implicitColumnExpression: 'Body',
  serviceNameExpression: 'ServiceName',
  bodyExpression: 'Body',
  eventAttributesExpression: 'LogAttributes',
  resourceAttributesExpression: 'ResourceAttributes',
  defaultTableSelectExpression: 'Timestamp,ServiceName,SeverityText,Body',
  severityTextExpression: 'SeverityText',
  severityNumberExpression: 'SeverityNumber',
  eventNameExpression: 'EventName',
  traceIdExpression: 'TraceId',
  spanIdExpression: 'SpanId',
  traceSourceId: 'Traces',
  metricSourceId: 'Metrics',
};

export const COUCHBASE_TRACE_SOURCE = {
  from: {
    databaseName: 'otel',
    scopeName: 'default',
    tableName: 'otel_traces',
  },
  kind: 'trace',
  timestampValueExpression: 'Timestamp',
  timestampFormat: 'iso8601',
  searchIndexName: 'fts_otel_traces',
  name: 'Traces',
  displayedTimestampValueExpression: 'Timestamp',
  implicitColumnExpression: 'SpanName',
  serviceNameExpression: 'ServiceName',
  eventAttributesExpression: 'SpanAttributes',
  resourceAttributesExpression: 'ResourceAttributes',
  defaultTableSelectExpression:
    'Timestamp,ServiceName,StatusCode,round(Duration/1e6),SpanName',
  traceIdExpression: 'TraceId',
  spanIdExpression: 'SpanId',
  durationExpression: 'Duration',
  durationPrecision: 9,
  parentSpanIdExpression: 'ParentSpanId',
  spanNameExpression: 'SpanName',
  spanKindExpression: 'SpanKind',
  statusCodeExpression: 'StatusCode',
  statusMessageExpression: 'StatusMessage',
  spanEventsValueExpression: 'Events',
  spanLinksValueExpression: 'Links',
  logSourceId: 'Logs',
  sessionSourceId: 'Sessions',
  metricSourceId: 'Metrics',
};

export const COUCHBASE_METRIC_SOURCE = {
  from: { databaseName: 'otel', scopeName: 'default', tableName: '' },
  kind: 'metric',
  timestampValueExpression: 'TimeUnix',
  timestampFormat: 'iso8601',
  name: 'Metrics',
  resourceAttributesExpression: 'ResourceAttributes',
  metricTables: {
    gauge: 'otel_metrics_gauge',
    histogram: 'otel_metrics_histogram',
    sum: 'otel_metrics_sum',
    summary: 'otel_metrics_summary',
    'exponential histogram': 'otel_metrics_exponential_histogram',
  },
  logSourceId: 'Logs',
};

export const COUCHBASE_SESSION_SOURCE = {
  from: {
    databaseName: 'otel',
    scopeName: 'default',
    tableName: 'hyperdx_sessions',
  },
  kind: 'session',
  timestampValueExpression: 'TimestampTime',
  timestampFormat: 'iso8601',
  name: 'Sessions',
  resourceAttributesExpression: 'ResourceAttributes',
  traceSourceId: 'Traces',
};

export const COUCHBASE_SOURCES = [
  COUCHBASE_LOG_SOURCE,
  COUCHBASE_TRACE_SOURCE,
  COUCHBASE_METRIC_SOURCE,
  COUCHBASE_SESSION_SOURCE,
];
