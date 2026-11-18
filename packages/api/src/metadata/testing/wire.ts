// Normalizes metadata wire payloads for snapshot tests, so the C0 snapshots
// captured on Mongo stay valid when each entity moves to Couchbase: ids,
// timestamps, and secrets differ per run and per backend, the shape must not.
const HEX24_EXACT = /^[0-9a-f]{24}$/i;
const HEX24_ANY = /\b[0-9a-f]{24}\b/gi;
/** Random tokens (invite links, keys): 32+ hex characters. */
const LONG_HEX = /\b[0-9a-f]{32,}\b/gi;
const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const isIsoDate = (v: string) =>
  ISO_DATE_PREFIX.test(v) && !Number.isNaN(Date.parse(v));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Keys whose values are random per run (tokens, keys) and only need a type. */
const VOLATILE_KEYS = new Set(['accessKey', 'apiKey', 'token', 'key']);

export interface WireNormalizer {
  (value: unknown): unknown;
  /** Placeholder already assigned to `id`, for cross-response assertions. */
  idOf(id: string): string | undefined;
}

/**
 * Returns a normalizer that maps each distinct 24-hex id to `<id:N>` in
 * first-seen order (keys visited sorted, so numbering does not depend on
 * backend key order). One normalizer per test keeps ids consistent across
 * the responses of that test.
 */
export function createWireNormalizer(): WireNormalizer {
  const ids = new Map<string, string>();
  const placeholder = (id: string) => {
    const k = id.toLowerCase();
    let p = ids.get(k);
    if (!p) {
      p = `<id:${ids.size + 1}>`;
      ids.set(k, p);
    }
    return p;
  };

  const visit = (value: unknown, key?: string): unknown => {
    if (Array.isArray(value)) return value.map(v => visit(v));
    if (value && typeof value === 'object') {
      const entries = Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, visit(v, k)]);
      return Object.fromEntries(entries);
    }
    if (typeof value !== 'string') return value;
    if (key && VOLATILE_KEYS.has(key) && value !== '') return '<secret>';
    if (HEX24_EXACT.test(value)) return placeholder(value);
    if (isIsoDate(value)) return '<date>';
    if (UUID.test(value)) return '<uuid>';
    return value
      .replace(LONG_HEX, '<token>')
      .replace(HEX24_ANY, m => placeholder(m));
  };

  return Object.assign((value: unknown) => visit(value), {
    idOf: (id: string) => ids.get(id.toLowerCase()),
  });
}
