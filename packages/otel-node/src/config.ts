import type { InstrumentationConfigMap } from '@opentelemetry/auto-instrumentations-node';
import { getStringFromEnv } from '@opentelemetry/core';
import type { Instrumentation } from '@opentelemetry/instrumentation';

import { setDefault, warnOnce } from './env';

/** Turns on HTTP and fetch body capture; see `httpBodyCapture`. */
export const CAPTURE_HTTP_BODY_ENV = 'CBT_CAPTURE_HTTP_BODY';

const HEADERS = 'OTEL_EXPORTER_OTLP_HEADERS';

/**
 * Options for `init`. An option with an environment variable is written to
 * `process.env` only when that variable is unset, so an operator's setting
 * wins and child processes inherit it. Everything else comes from the
 * standard `OTEL_*` variables.
 */
export type OtelNodeOptions = {
  /** `service.name`; written to `OTEL_SERVICE_NAME` unless `OTEL_RESOURCE_ATTRIBUTES` sets it. */
  serviceName?: string;
  /** OTLP/HTTP base URL without `/v1/<signal>`; written to `OTEL_EXPORTER_OTLP_ENDPOINT`. */
  endpoint?: string;
  /** `deployment.environment.name`, set on the resource. */
  environment?: string;
  /**
   * Ingestion key, sent as the `authorization` header through
   * `OTEL_EXPORTER_OTLP_HEADERS`. Ignored, with one warning, when that
   * variable already holds something else.
   */
  apiKey?: string;
  /**
   * Records HTTP request and response bodies (8 KiB each, sensitive keys
   * redacted) on `node:http` spans, and on `fetch` spans from Node.js 24.4.
   * Written to `CBT_CAPTURE_HTTP_BODY`. Defaults to off.
   */
  httpBodyCapture?: boolean;
  /** Auto-instrumentation config; hooks given here run after this package's. */
  instrumentations?: InstrumentationConfigMap;
  /** Instrumentations for libraries the bundle does not cover. */
  additionalInstrumentations?: Instrumentation[];
};

export function applyOptions(options: OtelNodeOptions): void {
  const resourceSetsName = (getStringFromEnv('OTEL_RESOURCE_ATTRIBUTES') ?? '')
    .split(',')
    .some(a => a.split('=')[0]?.trim() === 'service.name');
  if (!resourceSetsName) setDefault('OTEL_SERVICE_NAME', options.serviceName);
  setDefault('OTEL_EXPORTER_OTLP_ENDPOINT', options.endpoint);
  if (options.httpBodyCapture !== undefined) {
    setDefault(CAPTURE_HTTP_BODY_ENV, String(options.httpBodyCapture));
  }
  const apiKey = options.apiKey?.trim();
  if (!apiKey) return;
  const header = `authorization=${encodeURIComponent(apiKey)}`;
  const current = getStringFromEnv(HEADERS);
  if (current !== undefined && current !== header) {
    warnOnce('api-key', `${HEADERS} is set, so the apiKey option is ignored`);
  }
  setDefault(HEADERS, header);
  const noEndpoint = ['', '_TRACES', '_METRICS', '_LOGS'].every(
    s => getStringFromEnv(`OTEL_EXPORTER_OTLP${s}_ENDPOINT`) === undefined,
  );
  if (noEndpoint) {
    warnOnce(
      'no-endpoint',
      'apiKey is set but OTEL_EXPORTER_OTLP_ENDPOINT is not',
    );
  }
}
