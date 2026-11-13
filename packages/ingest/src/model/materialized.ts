import { parseUInt64OrZero, truncateToSeconds } from '../otlp/values';

export type MaterializedSpec = {
  name: string;
  clickhouseType: string;
  /** Human-readable source, written into the data-model doc. */
  source: string;
};

export const LOG_MATERIALIZED: readonly MaterializedSpec[] = [
  mat('k8s.cluster.name', 'LowCardinality(String)', 'ResourceAttributes'),
  mat('k8s.container.name', 'LowCardinality(String)', 'ResourceAttributes'),
  mat('k8s.deployment.name', 'LowCardinality(String)', 'ResourceAttributes'),
  mat('k8s.namespace.name', 'LowCardinality(String)', 'ResourceAttributes'),
  mat('k8s.node.name', 'LowCardinality(String)', 'ResourceAttributes'),
  mat('k8s.pod.name', 'LowCardinality(String)', 'ResourceAttributes'),
  mat('k8s.pod.uid', 'LowCardinality(String)', 'ResourceAttributes'),
  mat(
    'deployment.environment.name',
    'LowCardinality(String)',
    'ResourceAttributes',
  ),
  {
    name: '__hdx_materialized_session.id',
    clickhouseType: 'String',
    source: "LogAttributes['session.id']",
  },
];

export const TRACE_MATERIALIZED: readonly MaterializedSpec[] = [
  {
    name: '__hdx_materialized_rum.sessionId',
    clickhouseType: 'String',
    source: "ResourceAttributes['rum.sessionId']",
  },
  {
    name: 'SampleRate',
    clickhouseType: 'UInt64',
    source: "max(parseUInt64OrZero(SpanAttributes['SampleRate']), 1)",
  },
];

export const SESSION_MATERIALIZED: readonly MaterializedSpec[] = [
  {
    name: '__hdx_materialized_session.id',
    clickhouseType: 'String',
    source: "LogAttributes['session.id']",
  },
  {
    name: '__hdx_materialized_rum.sessionId',
    clickhouseType: 'String',
    source: "ResourceAttributes['rum.sessionId']",
  },
  {
    name: 'TimestampTime',
    clickhouseType: 'DateTime',
    source: 'Timestamp truncated to seconds',
  },
];

function mat(
  key: string,
  clickhouseType: string,
  mapName: string,
): MaterializedSpec {
  return {
    name: `__hdx_materialized_${key}`,
    clickhouseType,
    source: `${mapName}['${key}']`,
  };
}

function fromMap(map: unknown, key: string): string {
  if (map == null || typeof map !== 'object') return '';
  const value = (map as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : '';
}

export function applyLogMaterialized(doc: Record<string, unknown>): void {
  const resource = doc.ResourceAttributes;
  const log = doc.LogAttributes;
  for (const field of LOG_MATERIALIZED) {
    if (field.name === '__hdx_materialized_session.id') {
      doc[field.name] = fromMap(log, 'session.id');
    } else {
      const key = field.name.slice('__hdx_materialized_'.length);
      doc[field.name] = fromMap(resource, key);
    }
  }
}

export function applyTraceMaterialized(doc: Record<string, unknown>): void {
  doc['__hdx_materialized_rum.sessionId'] = fromMap(
    doc.ResourceAttributes,
    'rum.sessionId',
  );
  const raw = fromMap(doc.SpanAttributes, 'SampleRate');
  const parsed = parseUInt64OrZero(raw);
  doc.SampleRate = Math.max(parsed, 1);
}

export function applySessionMaterialized(doc: Record<string, unknown>): void {
  doc['__hdx_materialized_session.id'] = fromMap(
    doc.LogAttributes,
    'session.id',
  );
  doc['__hdx_materialized_rum.sessionId'] = fromMap(
    doc.ResourceAttributes,
    'rum.sessionId',
  );
  const timestamp = doc.Timestamp;
  doc.TimestampTime =
    typeof timestamp === 'string' ? truncateToSeconds(timestamp) : '';
}
