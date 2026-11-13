import {
  LOG_MATERIALIZED,
  type MaterializedSpec,
  SESSION_MATERIALIZED,
  TRACE_MATERIALIZED,
} from '@/model/materialized';
import { EPOCH_ISO } from '@/otlp/values';

export type CollectionName =
  | 'otel_logs'
  | 'otel_traces'
  | 'otel_metrics_gauge'
  | 'otel_metrics_sum'
  | 'otel_metrics_histogram'
  | 'otel_metrics_exponential_histogram'
  | 'otel_metrics_summary'
  | 'hyperdx_sessions';

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
  clickhouseType: string;
  encoding: FieldEncoding;
  nested?: FieldSpec[];
};

export type IndexSpec = { name: string; keys: string[] };

export type SearchIndexSpec = { name: string; definition: object };

export type TtlEnv =
  | 'CBT_LOGS_TTL'
  | 'CBT_TRACES_TTL'
  | 'CBT_METRICS_TTL'
  | 'CBT_SESSIONS_TTL';

export type CollectionSpec = {
  name: CollectionName;
  signal: 'logs' | 'traces' | 'metrics' | 'sessions';
  clickhouseTable: string;
  timestampField: 'Timestamp' | 'TimeUnix';
  ttlEnv: TtlEnv;
  fields: FieldSpec[];
  materialized: readonly MaterializedSpec[];
  indexes: IndexSpec[];
  search?: SearchIndexSpec;
};

const MAP = 'Map(LowCardinality(String), String)';

const str = (name: string, type = 'String'): FieldSpec => ({
  name,
  clickhouseType: type,
  encoding: 'string',
});
const lc = (name: string): FieldSpec => str(name, 'LowCardinality(String)');
const tsNs = (name: string): FieldSpec => ({
  name,
  clickhouseType: 'DateTime64(9)',
  encoding: 'timestamp_ns',
});
const tsS = (name: string): FieldSpec => ({
  name,
  clickhouseType: 'DateTime',
  encoding: 'timestamp_s',
});
const num = (name: string, type: string): FieldSpec => ({
  name,
  clickhouseType: type,
  encoding: 'number',
});
const map = (name: string): FieldSpec => ({
  name,
  clickhouseType: MAP,
  encoding: 'map',
});
const arr = (name: string, type: string): FieldSpec => ({
  name,
  clickhouseType: type,
  encoding: 'array',
});
const nested = (name: string, fields: FieldSpec[]): FieldSpec => ({
  name,
  clickhouseType: 'Nested',
  encoding: 'nested',
  nested: fields,
});

const LOG_FIELDS: FieldSpec[] = [
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

const SESSION_FIELDS: FieldSpec[] = LOG_FIELDS.filter(
  f => f.name !== 'EventName',
);

const TRACE_FIELDS: FieldSpec[] = [
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
    { name: 'Attributes', clickhouseType: `Array(${MAP})`, encoding: 'map' },
  ]),
  nested('Links', [
    str('TraceId'),
    str('SpanId'),
    str('TraceState'),
    { name: 'Attributes', clickhouseType: `Array(${MAP})`, encoding: 'map' },
  ]),
];

const EXEMPLARS = nested('Exemplars', [
  {
    name: 'FilteredAttributes',
    clickhouseType: `Array(${MAP})`,
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

const GAUGE_FIELDS: FieldSpec[] = [
  ...METRIC_COMMON,
  num('Value', 'Float64'),
  num('Flags', 'UInt32'),
  EXEMPLARS,
];
const SUM_FIELDS: FieldSpec[] = [
  ...GAUGE_FIELDS,
  num('AggregationTemporality', 'Int32'),
  { name: 'IsMonotonic', clickhouseType: 'Bool', encoding: 'bool' },
];
const HISTOGRAM_FIELDS: FieldSpec[] = [
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
const EXP_FIELDS: FieldSpec[] = [
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
const SUMMARY_FIELDS: FieldSpec[] = [
  ...METRIC_COMMON,
  num('Count', 'UInt64'),
  num('Sum', 'Float64'),
  nested('ValueAtQuantiles', [
    num('Quantile', 'Float64'),
    num('Value', 'Float64'),
  ]),
  num('Flags', 'UInt32'),
];

const LOG_INDEXES: IndexSpec[] = [
  ix('ix_logs_ts', ['`Timestamp` DESC']),
  ix('ix_logs_svc_ts', ['`ServiceName`', '`Timestamp` DESC']),
  ix('ix_logs_sev_ts', ['`SeverityText`', '`Timestamp` DESC']),
  ix('ix_logs_trace', ['`TraceId`']),
  ix('ix_logs_session', [
    '`__hdx_materialized_session.id`',
    '`Timestamp` DESC',
  ]),
  ix('ix_logs_logattr_keys', [
    'DISTINCT ARRAY k FOR k IN OBJECT_NAMES(`LogAttributes`) END',
  ]),
  ix('ix_logs_logattr_items', [
    'DISTINCT ARRAY (p.`name` || "=" || p.`val`) FOR p IN OBJECT_PAIRS(`LogAttributes`) END',
  ]),
  ix('ix_logs_resattr_keys', [
    'DISTINCT ARRAY k FOR k IN OBJECT_NAMES(`ResourceAttributes`) END',
  ]),
  ix('ix_logs_resattr_items', [
    'DISTINCT ARRAY (p.`name` || "=" || p.`val`) FOR p IN OBJECT_PAIRS(`ResourceAttributes`) END',
  ]),
];

const TRACE_INDEXES: IndexSpec[] = [
  ix('ix_traces_ts', ['`Timestamp` DESC']),
  ix('ix_traces_svc_ts', ['`ServiceName`', '`Timestamp` DESC']),
  ix('ix_traces_svc_span_ts', [
    '`ServiceName`',
    '`SpanName`',
    '`Timestamp` DESC',
  ]),
  ix('ix_traces_trace', ['`TraceId`', '`Timestamp`']),
  ix('ix_traces_session', [
    '`__hdx_materialized_rum.sessionId`',
    '`Timestamp` DESC',
  ]),
  ix('ix_traces_duration', ['`Duration`', '`Timestamp` DESC']),
  ix('ix_traces_spanattr_keys', [
    'DISTINCT ARRAY k FOR k IN OBJECT_NAMES(`SpanAttributes`) END',
  ]),
  ix('ix_traces_spanattr_items', [
    'DISTINCT ARRAY (p.`name` || "=" || p.`val`) FOR p IN OBJECT_PAIRS(`SpanAttributes`) END',
  ]),
  ix('ix_traces_resattr_keys', [
    'DISTINCT ARRAY k FOR k IN OBJECT_NAMES(`ResourceAttributes`) END',
  ]),
  ix('ix_traces_resattr_items', [
    'DISTINCT ARRAY (p.`name` || "=" || p.`val`) FOR p IN OBJECT_PAIRS(`ResourceAttributes`) END',
  ]),
];

function metricIndexes(type: string): IndexSpec[] {
  const t = type;
  return [
    ix(`ix_metrics_${t}_ts`, ['`TimeUnix` DESC']),
    ix(`ix_metrics_${t}_name_ts`, ['`MetricName`', '`TimeUnix` DESC']),
    ix(`ix_metrics_${t}_svc_name_ts`, [
      '`ServiceName`',
      '`MetricName`',
      '`TimeUnix` DESC',
    ]),
    ix(`ix_metrics_${t}_attr_items`, [
      'DISTINCT ARRAY (p.`name` || "=" || p.`val`) FOR p IN OBJECT_PAIRS(`Attributes`) END',
    ]),
  ];
}

const SESSION_INDEXES: IndexSpec[] = [
  ix('ix_sessions_ts', ['`Timestamp` DESC']),
  ix('ix_sessions_svc_ts', ['`ServiceName`', '`Timestamp` DESC']),
  ix('ix_sessions_session', ['`__hdx_materialized_session.id`', '`Timestamp`']),
  ix('ix_sessions_rum_session', [
    '`__hdx_materialized_rum.sessionId`',
    '`Timestamp`',
  ]),
];

function ix(name: string, keys: string[]): IndexSpec {
  return { name, keys };
}

function textField(name: string, analyzer: 'standard' | 'keyword'): object {
  const field: Record<string, unknown> = {
    name,
    type: 'text',
    analyzer,
    index: true,
  };
  if (analyzer === 'keyword') field.docvalues = true;
  return {
    enabled: true,
    dynamic: false,
    fields: [field],
  };
}

function searchDefinition(
  name: string,
  collection: string,
  properties: Record<string, object>,
): SearchIndexSpec {
  return {
    name,
    definition: {
      type: 'fulltext-index',
      name,
      sourceType: 'gocbcore',
      sourceName: 'otel',
      planParams: { indexPartitions: 6, numReplicas: 0 },
      params: {
        doc_config: { mode: 'scope.collection.type_field', type_field: 'type' },
        mapping: {
          default_analyzer: 'standard',
          default_datetime_parser: 'dateTimeOptional',
          default_mapping: { enabled: false, dynamic: false },
          index_dynamic: false,
          store_dynamic: false,
          docvalues_dynamic: false,
          types: {
            [`default.${collection}`]: {
              enabled: true,
              dynamic: false,
              properties,
            },
          },
        },
        store: { indexType: 'scorch' },
      },
    },
  };
}

const LOGS_SEARCH = searchDefinition('fts_otel_logs', 'otel_logs', {
  Body: textField('Body', 'standard'),
  Timestamp: {
    enabled: true,
    dynamic: false,
    fields: [
      { name: 'Timestamp', type: 'datetime', index: true, docvalues: true },
    ],
  },
  ServiceName: textField('ServiceName', 'keyword'),
  SeverityText: textField('SeverityText', 'keyword'),
});

const TRACES_SEARCH = searchDefinition('fts_otel_traces', 'otel_traces', {
  SpanName: textField('SpanName', 'standard'),
  Timestamp: {
    enabled: true,
    dynamic: false,
    fields: [
      { name: 'Timestamp', type: 'datetime', index: true, docvalues: true },
    ],
  },
  ServiceName: textField('ServiceName', 'keyword'),
});

function metricCollection(
  name: CollectionName,
  fields: FieldSpec[],
): CollectionSpec {
  const type = name.slice('otel_metrics_'.length);
  return {
    name,
    signal: 'metrics',
    clickhouseTable: name,
    timestampField: 'TimeUnix',
    ttlEnv: 'CBT_METRICS_TTL',
    fields,
    materialized: [],
    indexes: metricIndexes(type),
  };
}

export const COLLECTIONS: readonly CollectionSpec[] = [
  {
    name: 'otel_logs',
    signal: 'logs',
    clickhouseTable: 'otel_logs',
    timestampField: 'Timestamp',
    ttlEnv: 'CBT_LOGS_TTL',
    fields: LOG_FIELDS,
    materialized: LOG_MATERIALIZED,
    indexes: LOG_INDEXES,
    search: LOGS_SEARCH,
  },
  {
    name: 'otel_traces',
    signal: 'traces',
    clickhouseTable: 'otel_traces',
    timestampField: 'Timestamp',
    ttlEnv: 'CBT_TRACES_TTL',
    fields: TRACE_FIELDS,
    materialized: TRACE_MATERIALIZED,
    indexes: TRACE_INDEXES,
    search: TRACES_SEARCH,
  },
  metricCollection('otel_metrics_gauge', GAUGE_FIELDS),
  metricCollection('otel_metrics_sum', SUM_FIELDS),
  metricCollection('otel_metrics_histogram', HISTOGRAM_FIELDS),
  metricCollection('otel_metrics_exponential_histogram', EXP_FIELDS),
  metricCollection('otel_metrics_summary', SUMMARY_FIELDS),
  {
    name: 'hyperdx_sessions',
    signal: 'sessions',
    clickhouseTable: 'hyperdx_sessions',
    timestampField: 'Timestamp',
    ttlEnv: 'CBT_SESSIONS_TTL',
    fields: SESSION_FIELDS,
    materialized: SESSION_MATERIALIZED,
    indexes: SESSION_INDEXES,
  },
];

const BY_NAME = new Map(COLLECTIONS.map(spec => [spec.name, spec]));

export function collectionFor(name: CollectionName): CollectionSpec {
  const spec = BY_NAME.get(name);
  if (!spec) throw new Error(`Unknown collection ${name}`);
  return spec;
}

function defaultValue(field: FieldSpec): unknown {
  switch (field.encoding) {
    case 'timestamp_ns':
    case 'timestamp_s':
      return EPOCH_ISO;
    case 'string':
      return '';
    case 'number':
      return 0;
    case 'bool':
      return false;
    case 'map':
      return {};
    case 'array':
    case 'nested':
      return [];
    default:
      return null;
  }
}

/** Every field at its ClickHouse default, including materialized columns. */
export function defaultDocument(spec: CollectionSpec): Record<string, unknown> {
  const doc: Record<string, unknown> = {};
  for (const field of spec.fields) doc[field.name] = defaultValue(field);
  for (const field of spec.materialized) {
    if (field.name === 'SampleRate') doc[field.name] = 1;
    else if (field.clickhouseType === 'DateTime') doc[field.name] = EPOCH_ISO;
    else doc[field.name] = '';
  }
  return doc;
}

export function quoteIdent(name: string): string {
  if (name.includes('`')) throw new Error(`Illegal identifier ${name}`);
  return `\`${name}\``;
}

export function keyspace(
  bucket: string,
  scope: string,
  collection: string,
): string {
  return `${quoteIdent(bucket)}.${quoteIdent(scope)}.${quoteIdent(collection)}`;
}

/** Executable CREATE INDEX, with the key expressions from the model unchanged. */
export function createIndexSql(
  bucket: string,
  scope: string,
  spec: CollectionSpec,
  index: IndexSpec,
  replicas: number,
): string {
  const on = keyspace(bucket, scope, spec.name);
  return `CREATE INDEX ${index.name} IF NOT EXISTS ON ${on}(${index.keys.join(', ')}) WITH {"defer_build": true, "num_replica": ${replicas}}`;
}

export function searchDefinitionWithReplicas(
  search: SearchIndexSpec,
  replicas: number,
): Record<string, unknown> {
  const definition = structuredClone(search.definition) as {
    planParams: { numReplicas: number };
  };
  definition.planParams.numReplicas = replicas;
  return definition;
}
