import { createHash } from 'node:crypto';

/** Recursive key sort, no whitespace, numbers as JSON.stringify writes them. */
export function canonicalJson(value: unknown): string {
  return stringify(value);
}

function stringify(value: unknown): string {
  if (value === null) return 'null';
  const kind = typeof value;
  if (kind === 'string' || kind === 'boolean') return JSON.stringify(value);
  if (kind === 'number') {
    if (!Number.isFinite(value)) return 'null';
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => stringify(item)).join(',')}]`;
  }
  if (kind === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys
      .map(key => `${JSON.stringify(key)}:${stringify(obj[key])}`)
      .join(',')}}`;
  }
  return 'null';
}

export function contentHash(value: Record<string, unknown>): string {
  return createHash('sha256')
    .update(canonicalJson(value))
    .digest('hex')
    .slice(0, 32);
}

/** `<Timestamp>:<first 32 hex chars of SHA-256 of the canonical document>`. */
export function contentKey(
  timestamp: string,
  value: Record<string, unknown>,
): string {
  return `${timestamp}:${contentHash(value)}`;
}

/**
 * Span identity when both ids are present. An empty id uses the content-hash
 * form so a missing trace id cannot collide with every other empty-id span.
 */
export function spanKey(
  traceId: string,
  spanId: string,
  timestamp: string,
  value: Record<string, unknown>,
): string {
  if (traceId !== '' && spanId !== '') return `${traceId}:${spanId}`;
  return contentKey(timestamp, value);
}
