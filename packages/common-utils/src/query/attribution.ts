/**
 * Tags each Couchbase query with what asked for it, so a row in
 * `system:completed_requests` points back to a tile, a search, or an alert.
 *
 * Records what was asked for, never who asked. No team, user or session id
 * goes in here.
 *
 * Two places carry the tag (upstream used ClickHouse `log_comment` and
 * `query_id`). The `buildLogComment` JSON goes in a trailing block comment on
 * the statement, which `completed_requests.statement` keeps. The
 * `clientContextId` gets an `hdx-<surface>-<uuid>` id, readable in
 * `system:active_requests` while the query is still running.
 *
 * None of this changes what a query returns, so it must never throw.
 */

import { z } from 'zod';

/**
 * Which part of the product sent the query.
 */
export const QUERY_SURFACES = [
  'alert',
  'api',
  'chart-explorer',
  'chart-preview',
  'cli',
  'dashboard',
  'mcp',
  'metadata',
  'search',
  'service-dashboard',
  'session-replay',
  'unknown',
] as const;

export type QuerySurface = (typeof QUERY_SURFACES)[number];

/**
 * What we know about one query. Everything is optional; callers fill in
 * whatever they have.
 *
 * These key names end up in the log, so people write queries against them.
 * Renaming one breaks those queries, which is what `QUERY_ATTRIBUTION_VERSION`
 * is for.
 */
export type QueryAttribution = {
  surface?: QuerySurface;
  dashboard?: string;
  tile?: string;
  search?: string;
  alert?: string;
  source?: string;
  trace?: string;
  /** Anything more specific than the surface, e.g. an MCP tool name. */
  label?: string;
};

/**
 * Written as `v` into every log comment. Callers cannot set it per query.
 */
export const QUERY_ATTRIBUTION_VERSION = 1;

/**
 * Couchbase allows far more, but the browser sends settings in the URL, and a
 * long URL pushes the request onto a path some proxies reject.
 */
const MAX_LOG_COMMENT_BYTES = 1024;

/** Longest any single value may be. */
const MAX_FIELD_LENGTH = 128;

/**
 * Most useful first. If the payload runs out of room, fields at the end are
 * dropped whole, so the result is still valid JSON. Built from an object
 * literal so the `satisfies` fails to compile until a new id field is listed.
 */
function idFields(
  attribution: QueryAttribution,
): readonly (readonly [string, string | undefined])[] {
  return Object.entries({
    dashboard: attribution.dashboard,
    tile: attribution.tile,
    search: attribution.search,
    alert: attribution.alert,
    source: attribution.source,
    trace: attribution.trace,
    label: attribution.label,
  } satisfies Record<Exclude<keyof QueryAttribution, 'surface'>, unknown>);
}

/**
 * An allowlist of characters and a length cap. The browser sends this value
 * in a header, and the server writes it into a SQL++ block comment, so `*`
 * and `/` together must never survive (`/` alone is kept for route labels;
 * `*` is not on the list). ASCII only, so the length cap counts bytes.
 *
 * Everything here is an id, a route or a name we chose, never a user, team,
 * email or credential.
 */
function sanitizeField(value: string | undefined): string | undefined {
  if (typeof value !== 'string') return undefined;

  // By code point, not a regex, so no control character appears in this file.
  const isAllowed = (code: number) =>
    (code >= 0x61 && code <= 0x7a) || // a-z
    (code >= 0x41 && code <= 0x5a) || // A-Z
    (code >= 0x30 && code <= 0x39) || // 0-9
    code === 0x20 || // space
    code === 0x2d || // -
    code === 0x2e || // .
    code === 0x2f || // /
    code === 0x3a || // :
    code === 0x5f; // _

  let kept = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (isAllowed(code)) kept += char;
  }

  const cleaned = kept.trim();
  if (!cleaned) return undefined;
  return cleaned.slice(0, MAX_FIELD_LENGTH);
}

function isQuerySurface(value: unknown): value is QuerySurface {
  return (
    typeof value === 'string' &&
    (QUERY_SURFACES as readonly string[]).includes(value)
  );
}

/**
 * Later layers win, but only where they have a value. So a tile can add its own
 * id without erasing the dashboard id it sits inside.
 */
export function mergeQueryAttribution(
  ...layers: (QueryAttribution | undefined)[]
): QueryAttribution {
  let merged: QueryAttribution = {};
  for (const layer of layers) {
    if (!layer) continue;

    // Field by field: a spread would copy an `undefined` over a real value.
    // The `satisfies` fails to compile until a new field is merged here.
    merged = {
      surface: layer.surface || merged.surface,
      dashboard: layer.dashboard || merged.dashboard,
      tile: layer.tile || merged.tile,
      search: layer.search || merged.search,
      alert: layer.alert || merged.alert,
      source: layer.source || merged.source,
      trace: layer.trace || merged.trace,
      label: layer.label || merged.label,
    } satisfies Record<keyof QueryAttribution, unknown>;
  }
  return merged;
}

function stringify(payload: Map<string, string | number>): string {
  return JSON.stringify(Object.fromEntries(payload));
}

/** Returns undefined when there is nothing worth recording. */
export function buildLogComment(
  attribution: QueryAttribution | undefined,
): string | undefined {
  if (!attribution) return undefined;

  // A Map: insertion order is the drop order.
  const payload = new Map<string, string | number>([
    ['v', QUERY_ATTRIBUTION_VERSION],
  ]);
  if (isQuerySurface(attribution.surface)) {
    payload.set('surface', attribution.surface);
  }

  let serialized = stringify(payload);
  for (const [field, raw] of idFields(attribution)) {
    const cleaned = sanitizeField(raw);
    if (!cleaned) continue;
    payload.set(field, cleaned);
    const candidate = stringify(payload);
    // sanitizeField keeps only ASCII, so length is the byte count.
    if (candidate.length > MAX_LOG_COMMENT_BYTES) {
      payload.delete(field);
      continue;
    }
    serialized = candidate;
  }

  // Only the version survived, so there is nothing to say.
  return payload.size > 1 ? serialized : undefined;
}

export const QUERY_ATTRIBUTION_HEADER = 'x-hyperdx-query-attribution';

const optionalString = z.string().optional().catch(undefined);
const wireAttributionSchema = z.object({
  surface: z.enum(QUERY_SURFACES).optional().catch(undefined),
  dashboard: optionalString,
  tile: optionalString,
  search: optionalString,
  alert: optionalString,
  source: optionalString,
  trace: optionalString,
  label: optionalString,
} satisfies Record<keyof QueryAttribution, z.ZodTypeAny>);

export function parseLogComment(
  value: string | undefined,
): QueryAttribution | undefined {
  if (!value || value.length > MAX_LOG_COMMENT_BYTES) return undefined;

  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    return undefined;
  }
  return parseQueryAttribution(json);
}

/**
 * An attribution object that arrived over the wire (the `/couchbase/query`
 * body). Unknown keys and non-string values are dropped. Values are not
 * sanitized here: `buildLogComment` does that before they reach SQL++.
 */
export function parseQueryAttribution(
  value: unknown,
): QueryAttribution | undefined {
  const parsed = wireAttributionSchema.safeParse(value);
  if (!parsed.success) return undefined;

  const attribution = mergeQueryAttribution(parsed.data);
  return Object.values(attribution).some(Boolean) ? attribution : undefined;
}

function randomId(): string {
  const cryptoObj =
    typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj?.randomUUID) {
    try {
      return cryptoObj.randomUUID();
    } catch {
      // fall through
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function buildQueryId(
  attribution: QueryAttribution | undefined,
): string {
  const surface = isQuerySurface(attribution?.surface)
    ? attribution.surface
    : 'unknown';
  return `hdx-${surface}-${randomId()}`;
}
