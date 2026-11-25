/**
 * Rows for the filter-key edge case sources (`filter-key-edge-cases.spec.ts`).
 */
import { toIso30 } from '../../../ingest/src/model/fromShapedRow';

import {
  INTERESTING_FILTER_KEYS_JSON_AT_KEY,
  INTERESTING_FILTER_KEYS_ROWS,
  METADATA_MV_LOG_ATTR_KEY,
  METADATA_MV_ROWS,
} from './seed-data';

type Doc = { id: string; doc: Record<string, unknown> };

function logTimes(ms: number) {
  // Match Phase 5 Timestamp shape (30-char ISO) so time filters compare.
  const t = toIso30(new Date(ms));
  return { Timestamp: t, TimestampTime: t.slice(0, 19) + 'Z' };
}

export function buildInterestingFilterKeyDocs(seedRef: number): Doc[] {
  return INTERESTING_FILTER_KEYS_ROWS.map((row, i) => ({
    id: `interesting::${i}`,
    doc: {
      ...logTimes(seedRef - i * 60_000),
      TraceId: '',
      SpanId: '',
      TraceFlags: 0,
      SeverityText: 'info',
      SeverityNumber: 9,
      ServiceName: row.serviceName,
      Body: row.body,
      ResourceAttributes: {
        'key.subKey.subSubKey': row.resourceAttrValue,
      },
      ResourceAttributesJSON: {
        key: { subKey: { subSubKey: row.jsonValue } },
        [INTERESTING_FILTER_KEYS_JSON_AT_KEY]: row.jsonAtKeyValue,
      },
      '__hdx_materialized_k8s.cluster.name': row.clusterName,
      'service-name': row.serviceNameHyphen,
      'Map-Attributes': { 'pod-name': row.mapHyphenValue },
      'JSON-Attributes': { 'key-1': { 'key-2': row.jsonHyphenValue } },
      ScopeAttributes: {},
      LogAttributes: {},
    },
  }));
}

/**
 * Upstream places these rows (seedRef - (i + 1)s) in a ClickHouse table whose
 * facets come from 15-minute rollup MVs. Couchbase has no rollups (facets read
 * the base collection), so only the base rows are seeded; SeverityText is
 * empty, as upstream's insert leaves it at the column default.
 */
export function buildMetadataMvDocs(seedRef: number): Doc[] {
  return METADATA_MV_ROWS.map((row, i) => ({
    id: `metadata-mv::${i}`,
    doc: {
      ...logTimes(seedRef - (i + 1) * 1000),
      TraceId: '',
      SpanId: '',
      TraceFlags: 0,
      SeverityText: '',
      SeverityNumber: 0,
      ServiceName: row.serviceName,
      Body: row.body,
      ResourceAttributes: {},
      ScopeAttributes: {},
      LogAttributes: { [METADATA_MV_LOG_ATTR_KEY]: row.logAttrValue },
    },
  }));
}
