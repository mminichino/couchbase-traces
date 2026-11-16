import { contentKey, spanKey } from './keys';
import {
  applyLogMaterialized,
  applySessionMaterialized,
  applyTraceMaterialized,
} from './materialized';

export type ShapedRow = Record<string, unknown>;

export type CouchbaseSeedCollection =
  | 'logs'
  | 'traces'
  | 'sessions'
  | 'otel_logs'
  | 'otel_traces'
  | 'otel_sessions'
  | 'e2e_custom_service_name';

export type CouchbaseSeedDocument = {
  key: string;
  value: Record<string, unknown>;
  collection: CouchbaseSeedCollection;
  /** Document expiry as epoch milliseconds (optional). */
  expiryMs?: number;
};

function collectionForTable(table: string): CouchbaseSeedCollection {
  const lower = table.toLowerCase();
  if (lower.includes('custom_service')) return 'e2e_custom_service_name';
  if (lower.includes('session')) return 'otel_sessions';
  if (lower.includes('trace') || lower.includes('span')) return 'otel_traces';
  if (lower.includes('log')) return 'otel_logs';
  return 'otel_logs';
}

/** Phase 5 documents store Timestamp as 30-character ISO-8601 UTC. */
export function toIso30(d: Date): string {
  const iso = d.toISOString();
  const dot = iso.indexOf('.');
  const head = iso.slice(0, dot);
  const fraction = iso.slice(dot + 1, iso.length - 1);
  return `${head}.${fraction.padEnd(9, '0')}Z`;
}

export function nanosToIso(nanos: unknown): string | undefined {
  if (typeof nanos === 'number' && Number.isFinite(nanos)) {
    return toIso30(new Date(nanos / 1e6));
  }
  if (typeof nanos === 'string' && /^\d+$/.test(nanos)) {
    return toIso30(new Date(Number(nanos) / 1e6));
  }
  return undefined;
}

function normalizeTimestamp(row: ShapedRow): string {
  const fromNanos = nanosToIso(row.TimestampUnixNano);
  if (fromNanos) return fromNanos;
  const direct = row.Timestamp ?? row.TimestampTime ?? row.TimeUnix;
  if (typeof direct === 'string') {
    const parsed = Date.parse(direct);
    if (!Number.isNaN(parsed)) return toIso30(new Date(parsed));
    return direct;
  }
  if (typeof direct === 'number') return toIso30(new Date(direct));
  return toIso30(new Date());
}

/**
 * Maps a legacy store-shaped seed row to a Phase 5 Couchbase document.
 */
export function fromShapedRow(
  table: string,
  row: ShapedRow,
  opts?: {
    ttlMs?: number;
    nowMs?: number;
    collection?: CouchbaseSeedCollection;
  },
): CouchbaseSeedDocument {
  const value = { ...row };
  const ts = normalizeTimestamp(row);
  value.Timestamp = ts;
  const collection = opts?.collection ?? collectionForTable(table);
  const isTrace = collection.includes('trace');
  const isSession = collection.includes('session');

  if (isTrace) {
    applyTraceMaterialized(value);
  } else if (isSession) {
    applySessionMaterialized(value);
  } else {
    applyLogMaterialized(value);
  }

  let key: string;
  if (isTrace) {
    const traceId = String(row.TraceId ?? '');
    const spanId = String(row.SpanId ?? '');
    key = spanKey(traceId, spanId, ts, value);
  } else {
    key = contentKey(ts, value);
  }

  const expiryMs =
    opts?.ttlMs != null && opts.nowMs != null
      ? opts.nowMs + opts.ttlMs
      : undefined;

  return { key, value, collection, expiryMs };
}
