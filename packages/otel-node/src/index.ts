/**
 * The Couchbase Traces API's and Next.js server's own OpenTelemetry setup.
 *
 * Ported from @clickhouse/clickstack-node 1.0.2 (Apache-2.0), see
 * NOTICE. The AWS
 * Lambda support (`withFlush`, invocation deadlines) and the `register`
 * entry are left out; nothing here runs on Lambda or preloads it.
 */
export type { OtelNodeOptions } from './config';
export { init } from './init';
export { flush, shutdown } from './lifecycle';
