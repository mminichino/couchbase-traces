import {
  type CollectionName,
  EXP_FIELDS,
  type FieldSpec,
  GAUGE_FIELDS,
  HISTOGRAM_FIELDS,
  LOG_FIELDS,
  SESSION_FIELDS,
  SUM_FIELDS,
  SUMMARY_FIELDS,
  TRACE_FIELDS,
} from '@couchbase-traces/common-utils/dist/couchbase/otelSchema';

import {
  LOG_MATERIALIZED,
  type MaterializedSpec,
  SESSION_MATERIALIZED,
  TRACE_MATERIALIZED,
} from '@/model/materialized';
import { EPOCH_ISO } from '@/otlp/values';

export type {
  CollectionName,
  FieldEncoding,
  FieldSpec,
} from '@couchbase-traces/common-utils/dist/couchbase/otelSchema';

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
  sourceTable: string;
  timestampField: 'Timestamp' | 'TimeUnix';
  ttlEnv: TtlEnv;
  fields: FieldSpec[];
  materialized: readonly MaterializedSpec[];
  indexes: IndexSpec[];
  search?: SearchIndexSpec;
};

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
    sourceTable: name,
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
    sourceTable: 'otel_logs',
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
    sourceTable: 'otel_traces',
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
    name: 'otel_sessions',
    signal: 'sessions',
    sourceTable: 'otel_sessions',
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

/** Every field at its legacy store default, including materialized columns. */
export function defaultDocument(spec: CollectionSpec): Record<string, unknown> {
  const doc: Record<string, unknown> = {};
  for (const field of spec.fields) doc[field.name] = defaultValue(field);
  for (const field of spec.materialized) {
    if (field.name === 'SampleRate') doc[field.name] = 1;
    else if (field.columnType === 'DateTime') doc[field.name] = EPOCH_ISO;
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
