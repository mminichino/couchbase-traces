/** OTLP/JSON as the collector's `otlphttp` exporter sends it. Unknown fields are ignored. */

export type AnyValue = {
  stringValue?: string;
  intValue?: string | number;
  doubleValue?: number;
  boolValue?: boolean;
  bytesValue?: string;
  arrayValue?: { values?: AnyValue[] };
  kvlistValue?: { values?: KeyValue[] };
};

export type KeyValue = { key?: string; value?: AnyValue };

export type LogRecord = {
  timeUnixNano?: string | number;
  observedTimeUnixNano?: string | number;
  severityNumber?: number;
  severityText?: string;
  body?: AnyValue;
  attributes?: KeyValue[];
  flags?: number;
  traceId?: string;
  spanId?: string;
  eventName?: string;
};

export type Scope = {
  name?: string;
  version?: string;
  attributes?: KeyValue[];
  droppedAttributesCount?: number;
};

export type ExportLogsServiceRequest = {
  resourceLogs?: {
    schemaUrl?: string;
    resource?: { attributes?: KeyValue[] };
    scopeLogs?: {
      schemaUrl?: string;
      scope?: Scope;
      logRecords?: LogRecord[];
    }[];
  }[];
};

export type SpanEvent = {
  timeUnixNano?: string | number;
  name?: string;
  attributes?: KeyValue[];
};

export type SpanLink = {
  traceId?: string;
  spanId?: string;
  traceState?: string;
  attributes?: KeyValue[];
};

export type Span = {
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
  traceState?: string;
  name?: string;
  kind?: number;
  startTimeUnixNano?: string | number;
  endTimeUnixNano?: string | number;
  attributes?: KeyValue[];
  events?: SpanEvent[];
  links?: SpanLink[];
  status?: { code?: number; message?: string };
  flags?: number;
};

export type ExportTraceServiceRequest = {
  resourceSpans?: {
    schemaUrl?: string;
    resource?: { attributes?: KeyValue[] };
    scopeSpans?: {
      schemaUrl?: string;
      scope?: Scope;
      spans?: Span[];
    }[];
  }[];
};

export type Exemplar = {
  filteredAttributes?: KeyValue[];
  timeUnixNano?: string | number;
  asDouble?: number;
  asInt?: string | number;
  spanId?: string;
  traceId?: string;
};

export type NumberDataPoint = {
  attributes?: KeyValue[];
  startTimeUnixNano?: string | number;
  timeUnixNano?: string | number;
  asDouble?: number;
  asInt?: string | number;
  exemplars?: Exemplar[];
  flags?: number;
};

export type HistogramDataPoint = {
  attributes?: KeyValue[];
  startTimeUnixNano?: string | number;
  timeUnixNano?: string | number;
  count?: string | number;
  sum?: number;
  bucketCounts?: (string | number)[];
  explicitBounds?: number[];
  exemplars?: Exemplar[];
  flags?: number;
  min?: number;
  max?: number;
};

export type ExponentialHistogramDataPoint = {
  attributes?: KeyValue[];
  startTimeUnixNano?: string | number;
  timeUnixNano?: string | number;
  count?: string | number;
  sum?: number;
  scale?: number;
  zeroCount?: string | number;
  positive?: { offset?: number; bucketCounts?: (string | number)[] };
  negative?: { offset?: number; bucketCounts?: (string | number)[] };
  exemplars?: Exemplar[];
  flags?: number;
  min?: number;
  max?: number;
};

export type SummaryDataPoint = {
  attributes?: KeyValue[];
  startTimeUnixNano?: string | number;
  timeUnixNano?: string | number;
  count?: string | number;
  sum?: number;
  quantileValues?: { quantile?: number; value?: number }[];
  flags?: number;
};

export type Metric = {
  name?: string;
  description?: string;
  unit?: string;
  gauge?: { dataPoints?: NumberDataPoint[] };
  sum?: {
    dataPoints?: NumberDataPoint[];
    aggregationTemporality?: number;
    isMonotonic?: boolean;
  };
  histogram?: {
    dataPoints?: HistogramDataPoint[];
    aggregationTemporality?: number;
  };
  exponentialHistogram?: {
    dataPoints?: ExponentialHistogramDataPoint[];
    aggregationTemporality?: number;
  };
  summary?: { dataPoints?: SummaryDataPoint[] };
};

export type ExportMetricsServiceRequest = {
  resourceMetrics?: {
    schemaUrl?: string;
    resource?: { attributes?: KeyValue[] };
    scopeMetrics?: {
      schemaUrl?: string;
      scope?: Scope;
      metrics?: Metric[];
    }[];
  }[];
};
