/**
 * The OTel collection fields as ingest writes them, with the column types the
 * upstream ClickHouse DDL declares. Ingest builds documents and setup docs
 * from these; the describe tools fall back to them for an empty collection,
 * as upstream DESCRIBE TABLE reports DDL columns with zero rows.
 *
 * Plain data, but server-only by convention: the app lint config forbids
 * importing it into the browser bundle.
 */
import type { ColumnMeta } from '@/query/types';

export type CollectionName =
  | 'otel_logs'
  | 'otel_traces'
  | 'otel_metrics_gauge'
  | 'otel_metrics_sum'
  | 'otel_metrics_histogram'
  | 'otel_metrics_exponential_histogram'
  | 'otel_metrics_summary'
  | 'otel_sessions';

export type FieldEncoding =
  | 'timestamp_ns'
  | 'timestamp_s'
  | 'string'
  | 'number'
  | 'bool'
  | 'map'
  | 'array'
  | 'nested';

export type FieldSpec = {
  name: string;
  columnType: string;
  encoding: FieldEncoding;
  nested?: FieldSpec[];
};

const MAP = 'Map(LowCardinality(String), String)';

const str = (name: string, type = 'String'): FieldSpec => ({
  name,
  columnType: type,
  encoding: 'string',
});
const lc = (name: string): FieldSpec => str(name, 'LowCardinality(String)');
const tsNs = (name: string): FieldSpec => ({
  name,
  columnType: 'DateTime64(9)',
  encoding: 'timestamp_ns',
});
const tsS = (name: string): FieldSpec => ({
  name,
  columnType: 'DateTime',
  encoding: 'timestamp_s',
});
const num = (name: string, type: string): FieldSpec => ({
  name,
  columnType: type,
  encoding: 'number',
});
const map = (name: string): FieldSpec => ({
  name,
  columnType: MAP,
  encoding: 'map',
});
const arr = (name: string, type: string): FieldSpec => ({
  name,
  columnType: type,
  encoding: 'array',
});
const nested = (name: string, fields: FieldSpec[]): FieldSpec => ({
  name,
  columnType: 'Nested',
  encoding: 'nested',
  nested: fields,
});

export const LOG_FIELDS: FieldSpec[] = [
  tsNs('Timestamp'),
  str('TraceId'),
  str('SpanId'),
  num('TraceFlags', 'UInt8'),
  lc('SeverityText'),
  num('SeverityNumber', 'UInt8'),
  lc('ServiceName'),
  str('Body'),
  lc('ResourceSchemaUrl'),
  map('ResourceAttributes'),
  lc('ScopeSchemaUrl'),
  str('ScopeName'),
  lc('ScopeVersion'),
  map('ScopeAttributes'),
  map('LogAttributes'),
  str('EventName'),
];

export const SESSION_FIELDS: FieldSpec[] = LOG_FIELDS.filter(
  f => f.name !== 'EventName',
);

export const TRACE_FIELDS: FieldSpec[] = [
  tsNs('Timestamp'),
  str('TraceId'),
  str('SpanId'),
  str('ParentSpanId'),
  str('TraceState'),
  lc('SpanName'),
  lc('SpanKind'),
  lc('ServiceName'),
  map('ResourceAttributes'),
  str('ScopeName'),
  str('ScopeVersion'),
  map('SpanAttributes'),
  num('Duration', 'UInt64'),
  lc('StatusCode'),
  str('StatusMessage'),
  nested('Events', [
    tsNs('Timestamp'),
    lc('Name'),
    { name: 'Attributes', columnType: `Array(${MAP})`, encoding: 'map' },
  ]),
  nested('Links', [
    str('TraceId'),
    str('SpanId'),
    str('TraceState'),
    { name: 'Attributes', columnType: `Array(${MAP})`, encoding: 'map' },
  ]),
];

const EXEMPLARS = nested('Exemplars', [
  {
    name: 'FilteredAttributes',
    columnType: `Array(${MAP})`,
    encoding: 'map',
  },
  tsS('TimeUnix'),
  num('Value', 'Float64'),
  str('SpanId'),
  str('TraceId'),
]);

const METRIC_COMMON: FieldSpec[] = [
  map('ResourceAttributes'),
  str('ResourceSchemaUrl'),
  str('ScopeName'),
  str('ScopeVersion'),
  map('ScopeAttributes'),
  num('ScopeDroppedAttrCount', 'UInt32'),
  str('ScopeSchemaUrl'),
  lc('ServiceName'),
  lc('MetricName'),
  str('MetricDescription'),
  str('MetricUnit'),
  map('Attributes'),
  tsS('StartTimeUnix'),
  tsS('TimeUnix'),
];

export const GAUGE_FIELDS: FieldSpec[] = [
  ...METRIC_COMMON,
  num('Value', 'Float64'),
  num('Flags', 'UInt32'),
  EXEMPLARS,
];
export const SUM_FIELDS: FieldSpec[] = [
  ...GAUGE_FIELDS,
  num('AggregationTemporality', 'Int32'),
  { name: 'IsMonotonic', columnType: 'Bool', encoding: 'bool' },
];
export const HISTOGRAM_FIELDS: FieldSpec[] = [
  ...METRIC_COMMON,
  num('Count', 'UInt64'),
  num('Sum', 'Float64'),
  arr('BucketCounts', 'Array(UInt64)'),
  arr('ExplicitBounds', 'Array(Float64)'),
  EXEMPLARS,
  num('Flags', 'UInt32'),
  num('Min', 'Float64'),
  num('Max', 'Float64'),
  num('AggregationTemporality', 'Int32'),
];
export const EXP_FIELDS: FieldSpec[] = [
  ...METRIC_COMMON,
  num('Count', 'UInt64'),
  num('Sum', 'Float64'),
  num('Scale', 'Int32'),
  num('ZeroCount', 'UInt64'),
  num('PositiveOffset', 'Int32'),
  arr('PositiveBucketCounts', 'Array(UInt64)'),
  num('NegativeOffset', 'Int32'),
  arr('NegativeBucketCounts', 'Array(UInt64)'),
  EXEMPLARS,
  num('Flags', 'UInt32'),
  num('Min', 'Float64'),
  num('Max', 'Float64'),
  num('AggregationTemporality', 'Int32'),
];
export const SUMMARY_FIELDS: FieldSpec[] = [
  ...METRIC_COMMON,
  num('Count', 'UInt64'),
  num('Sum', 'Float64'),
  nested('ValueAtQuantiles', [
    num('Quantile', 'Float64'),
    num('Value', 'Float64'),
  ]),
  num('Flags', 'UInt32'),
];

const FIELDS_BY_COLLECTION: ReadonlyMap<string, readonly FieldSpec[]> = new Map<
  CollectionName,
  FieldSpec[]
>([
  ['otel_logs', LOG_FIELDS],
  ['otel_traces', TRACE_FIELDS],
  ['otel_metrics_gauge', GAUGE_FIELDS],
  ['otel_metrics_sum', SUM_FIELDS],
  ['otel_metrics_histogram', HISTOGRAM_FIELDS],
  ['otel_metrics_exponential_histogram', EXP_FIELDS],
  ['otel_metrics_summary', SUMMARY_FIELDS],
  ['otel_sessions', SESSION_FIELDS],
]);

/**
 * Declared top-level columns for an OTel collection, or undefined for any
 * other collection. Nested fields are stored as arrays of objects, which is
 * how INFER reports them once documents exist.
 */
export function declaredColumns(collection: string): ColumnMeta[] | undefined {
  const fields = FIELDS_BY_COLLECTION.get(collection);
  if (!fields) return undefined;
  return fields.map(f => ({
    codec_expression: '',
    comment: '',
    default_expression: '',
    default_type: '',
    ttl_expression: '',
    name: f.name,
    type: f.encoding === 'nested' ? 'Array(JSON)' : f.columnType,
  }));
}
