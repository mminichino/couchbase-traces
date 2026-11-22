/**
 * Metadata document ids: 24 hex characters in the ObjectId layout. Shared by
 * the API (request validation) and the app (skipping fetches for ids that
 * cannot exist, so a mistyped URL shows a not-found state instead of a 400).
 */
const METADATA_ID_RE = /^[0-9a-f]{24}$/i;

/** Exactly 24 hex characters, any case. */
export function isMetadataId(value: unknown): value is string {
  return typeof value === 'string' && METADATA_ID_RE.test(value);
}
