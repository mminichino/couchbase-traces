/**
 * Collector URL handling for the browser telemetry SDK.
 *
 * Ported from @clickhouse/clickstack-browser 1.2.1 (Apache-2.0), see
 * NOTICE.
 */

const SIGNAL_PATH = /\/v1\/(?:traces|logs)\/*$/;

/**
 * Resolves a collector URL to an absolute http(s) URL. A relative value, such
 * as a same-origin proxy path, resolves against the page URL, because the
 * upstream SDK accepts only absolute URLs.
 *
 * @returns The URL, or `undefined` when empty, unparsable, or not http(s).
 */
export function resolveUrl(url: string | undefined): URL | undefined {
  if (!url) return undefined;
  try {
    const resolved = new URL(url, location.href);
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
      return undefined;
    }
    resolved.hash = '';
    return resolved;
  } catch {
    return undefined;
  }
}

/**
 * Builds one signal's OTLP/HTTP URL from the collector base URL, as for
 * `OTEL_EXPORTER_OTLP_ENDPOINT`: `/v1/<signal>` is appended after dropping a
 * `/v1/traces` or `/v1/logs` the endpoint already ends with.
 */
export function signalUrl(
  endpoint: string | undefined,
  signal: 'traces' | 'logs',
): string | undefined {
  const url = resolveUrl(endpoint);
  if (url === undefined) return undefined;
  url.pathname = `${url.pathname.replace(SIGNAL_PATH, '').replace(/\/+$/, '')}/v1/${signal}`;
  return url.href;
}

/** Whether an endpoint already ends with `/v1/traces` or `/v1/logs`. */
export function hasSignalPath(endpoint: string | undefined): boolean {
  const url = resolveUrl(endpoint);
  return url !== undefined && SIGNAL_PATH.test(url.pathname);
}

type PageState = { initialized?: boolean; recording?: boolean };

const PAGE_KEY = Symbol.for('@couchbase-traces/browser-telemetry');

/** Page-wide flags on `globalThis`, so a second bundle copy sees them too. */
export function pageState(): PageState {
  const holder = globalThis as typeof globalThis & {
    [PAGE_KEY]?: PageState;
  };
  return (holder[PAGE_KEY] ??= {});
}
