import type { CollectionName } from '@/model/collections';
import { collectionFor, defaultDocument } from '@/model/collections';
import { contentKey, spanKey } from '@/model/keys';
import {
  applyLogMaterialized,
  applySessionMaterialized,
  applyTraceMaterialized,
} from '@/model/materialized';
import type { KeyValue } from '@/otlp/types';
import {
  attributesToMap,
  dateToIso,
  EPOCH_ISO,
  isoToEpochMs,
  nanosToIso,
} from '@/otlp/values';

export type Doc = {
  collection: CollectionName;
  key: string;
  value: Record<string, unknown>;
  eventTimeMs: number;
};

export type TransformResult = {
  docs: Doc[];
  rejected: { reason: string; count: number }[];
  timestampDefaulted: number;
};

export type ResourceScope = {
  resourceAttributes: Record<string, string>;
  resourceSchemaUrl: string;
  scopeName: string;
  scopeVersion: string;
  scopeAttributes: Record<string, string>;
  scopeSchemaUrl: string;
  scopeDropped: number;
};

export function serviceName(attrs: Record<string, string>): string {
  return attrs['service.name'] ?? '';
}

export function reject(
  counts: Map<string, number>,
  reason: string,
  n = 1,
): void {
  counts.set(reason, (counts.get(reason) ?? 0) + n);
}

export function rejectedOf(
  counts: Map<string, number>,
): TransformResult['rejected'] {
  return [...counts.entries()].map(([reason, count]) => ({ reason, count }));
}

export function resourceOf(
  resource: { attributes?: KeyValue[] } | undefined,
  resourceSchemaUrl: string | undefined,
  scope:
    | {
        name?: string;
        version?: string;
        attributes?: KeyValue[];
        droppedAttributesCount?: number;
      }
    | undefined,
  scopeSchemaUrl: string | undefined,
): ResourceScope {
  return {
    resourceAttributes: attributesToMap(resource?.attributes),
    resourceSchemaUrl: resourceSchemaUrl ?? '',
    scopeName: scope?.name ?? '',
    scopeVersion: scope?.version ?? '',
    scopeAttributes: attributesToMap(scope?.attributes),
    scopeSchemaUrl: scopeSchemaUrl ?? '',
    scopeDropped: scope?.droppedAttributesCount ?? 0,
  };
}

/** Non-zero time, else observed, else `now` (and the defaulted counter). */
export function resolveTimestamp(
  primary: string | number | undefined,
  observed: string | number | undefined,
  now: Date,
  precision: 'ns' | 's',
): { iso: string; defaulted: number } {
  const first = nanosToIso(primary, precision);
  if (first) return { iso: first, defaulted: 0 };
  const second = nanosToIso(observed, precision);
  if (second) return { iso: second, defaulted: 0 };
  return { iso: dateToIso(now, precision), defaulted: 1 };
}

export function orEpoch(
  nanos: string | number | undefined,
  precision: 'ns' | 's',
): string {
  return nanosToIso(nanos, precision) ?? EPOCH_ISO;
}

export function finishLog(
  collection: 'otel_logs' | 'hyperdx_sessions',
  doc: Record<string, unknown>,
): Doc {
  if (collection === 'otel_logs') applyLogMaterialized(doc);
  else applySessionMaterialized(doc);
  const timestamp = String(doc.Timestamp);
  return {
    collection,
    key: contentKey(timestamp, doc),
    value: doc,
    eventTimeMs: isoToEpochMs(timestamp),
  };
}

export function blank(collection: CollectionName): Record<string, unknown> {
  return defaultDocument(collectionFor(collection));
}

export function finishSpan(doc: Record<string, unknown>): Doc {
  applyTraceMaterialized(doc);
  const timestamp = String(doc.Timestamp);
  return {
    collection: 'otel_traces',
    key: spanKey(String(doc.TraceId), String(doc.SpanId), timestamp, doc),
    value: doc,
    eventTimeMs: isoToEpochMs(timestamp),
  };
}
