/**
 * Ported from @clickhouse/clickstack-node 1.0.2 (Apache-2.0), see
 * NOTICE.
 */
import type { NodeSDK } from '@opentelemetry/sdk-node';

export type State = {
  initialized?: boolean;
  sdk?: NodeSDK;
  shutdownPromise?: Promise<void>;
  flushInFlight?: Promise<unknown>;
  esmHook?: 'sync' | 'async' | 'failed';
  unsubscribeUndici?: () => void;
  warned?: Set<string>;
};

const KEY = Symbol.for('@couchbase-traces/otel-node');

/**
 * Per-thread state on `globalThis`, so two copies of this package in one
 * process (the Next.js server bundles one per route chunk) share one SDK.
 */
export function getState(): State {
  const slot = globalThis as { [KEY]?: State };
  return (slot[KEY] ??= {});
}
