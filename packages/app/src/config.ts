import { env } from 'next-runtime-env';

// eslint-disable-next-line no-restricted-imports -- package.json lives outside src, no @/ alias reaches it
import packageJson from '../package.json';

const NODE_ENV = process.env.NODE_ENV as string;
export const HDX_API_KEY = process.env.CBT_API_KEY as string; // for nextjs server
export const HDX_SERVICE_NAME =
  process.env.NEXT_PUBLIC_OTEL_SERVICE_NAME ?? 'hdx-oss-dev-app';
export const CBT_EXPORTER_ENABLED =
  (process.env.CBT_EXPORTER_ENABLED ?? 'true') === 'true';

export function parseResourceAttributes(raw: string): Record<string, string> {
  return raw
    .split(',')
    .filter(Boolean)
    .reduce(
      (acc, pair) => {
        const idx = pair.indexOf('=');
        if (idx > 0) {
          acc[decodeURIComponent(pair.slice(0, idx))] = decodeURIComponent(
            pair.slice(idx + 1),
          );
        }
        return acc;
      },
      {} as Record<string, string>,
    );
}

export const HDX_COLLECTOR_URL =
  process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT ??
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ??
  'http://localhost:4318';
export const HDX_TRACES_COLLECTOR_URL =
  process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ??
  process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
export const HDX_METRICS_COLLECTOR_URL =
  process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_METRICS_ENDPOINT ??
  process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT;
export const HDX_LOGS_COLLECTOR_URL =
  process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_LOGS_ENDPOINT ??
  process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT;
export const IS_DEV = NODE_ENV === 'development';

// Frontend build version — from package.json, bundled at build time. Will include sha in nightly builds.
export const APP_VERSION = packageJson.version ?? 'dev';

export const IS_OSS = process.env.NEXT_PUBLIC_IS_OSS ?? 'true' === 'true';
/** Local app mode was removed in Phase 10. */
export const IS_LOCAL_MODE = false;
/** ClickHouse Cloud embed build was removed in Phase 10. */
export const IS_CLICKHOUSE_BUILD = false;
// Deployment path prefix, mirroring `basePath` in next.config.mjs. Needed
// anywhere an absolute URL is built for something outside the browser to call:
// `window.location.origin` alone drops the prefix, and the API is served under
// the same one as the UI.
export const BASE_PATH = process.env.NEXT_PUBLIC_CBT_BASE_PATH ?? '';
export const IS_NOINDEX = process.env.NEXT_PUBLIC_NOINDEX === 'true';

/** Time captured at module load, use this a stable fallback/default time value instead of Date.now() defined in each React component file */
// eslint-disable-next-line no-restricted-syntax
export const NOW = Date.now();

// Features in development
// When adding an env-configurable flag (one whose value varies by deployment), add it to the feature snapshot in hdxDebug.ts.
export const IS_K8S_DASHBOARD_ENABLED = true;
// LLM dashboard cost estimation. Default off pending a price-management
// story: the bundled catalog goes stale between releases and can't account
// for provider discounts, so tokens are the primary metric for now.
export const IS_LLM_COST_ENABLED =
  env('NEXT_PUBLIC_IS_LLM_COST_ENABLED') === 'true';
export const IS_METRICS_ENABLED = true;
export const IS_MTVIEWS_ENABLED = false;
export const IS_SESSIONS_ENABLED = true;
/** PromQL was dropped (Phase 5a). Code is deleted in Phase 10. */
export const IS_PROMQL_ENABLED = false;
export const IS_ADHOC_FILTERS_ENABLED =
  env('NEXT_PUBLIC_ENABLE_ADHOC_FILTERS') === 'true';
// Suffix for the tab title/sidebar pill. Shown in full in the page title;
// only truncated visually (via CSS ellipsis) in the sidebar, where space is
// constrained. Internal whitespace is collapsed so it displays consistently
// wherever it's shown.
export const INSTANCE_LABEL = (env('NEXT_PUBLIC_INSTANCE_LABEL') ?? '')
  .trim()
  .replace(/\s+/g, ' ');
// Leading-space-prefixed, ready to append directly to a title string; empty
// when INSTANCE_LABEL is unset, so `${brandName}${INSTANCE_TITLE_SUFFIX}` is
// always safe to write regardless of whether a label is configured.
export const INSTANCE_TITLE_SUFFIX = INSTANCE_LABEL ? ` ${INSTANCE_LABEL}` : '';
// Alert detail page (/alerts/:id). Default off — currently enabled only in
// dev (.env.development) and CI (e2e webserver) while the feature bakes.
export const IS_ALERT_DETAILS_ENABLED =
  env('NEXT_PUBLIC_ENABLE_ALERT_DETAILS') === 'true';
const IS_IAC_HELPERS_ENABLED = true;
export const IS_IAC_EXPORT_ENABLED = IS_IAC_HELPERS_ENABLED;
