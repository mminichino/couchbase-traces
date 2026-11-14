/**
 * Tags each Couchbase query with what asked for it, so a row in
 * `system.query_log` points back to a tile, a search, or an alert.
 *
 * Records what was asked for, never who asked. No team, user or session id
 * goes in here.
 *
 * Two places carry the tag. `log_comment` holds the JSON and is what you query
 * later. `query_id` gets an `hdx-<surface>-<uuid>` prefix, which is readable in
 * `system.processes` while the query is still running.
 *
 * None of this changes what a query returns, so it must never throw.
 *
 * One exception: queries that skip settings processing (the `system.settings`,
 * server version and Cloud-detection probes, and the onboarding connection
 * check) get a `query_id` but an empty `log_comment`.
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
  const parsed = wireAttributionSchema.safeParse(json);
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
