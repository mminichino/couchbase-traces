/**
 * Self-telemetry preload, loaded with `-r` ahead of the API and the task
 * runner (bin/hyperdx, the dev scripts, the e2e web server).
 *
 * It calls @couchbase-traces/otel-node's init() with the key from CBT_API_KEY.
 * decideSelfTelemetry keeps the old HyperDX SDK's key handling and start
 * condition, shared with the Next.js server.
 *
 * It imports nothing from the app, and from common-utils only a module without
 * dependencies: modules loaded before init() are not instrumented.
 */
import { isMainThread } from 'node:worker_threads';

import { decideSelfTelemetry } from '@couchbase-traces/common-utils/dist/selfTelemetry';
import { init } from '@couchbase-traces/otel-node';

const telemetry = decideSelfTelemetry(process.env);

// `-r` preloads also run in worker threads, such as the pino transport, and
// init() in a worker starts a second SDK there.
if (isMainThread && telemetry.start) {
  if (telemetry.otlpHeaders !== undefined) {
    process.env.OTEL_EXPORTER_OTLP_HEADERS = telemetry.otlpHeaders;
  }
  init({
    apiKey: telemetry.apiKey,
    // Only set in development, where host metrics were collected before. It
    // applies to every process this preloads, so the dev API and the dev task
    // runner both report them. An explicit `enabled` value would override the
    // operator's OTEL_NODE_ENABLED_INSTRUMENTATIONS and _DISABLED_ lists
    // elsewhere.
    instrumentations:
      process.env.NODE_ENV === 'development'
        ? { '@opentelemetry/instrumentation-host-metrics': { enabled: true } }
        : undefined,
  });
}
