// Server only: AsyncLocalStorage is a Node API.
import { AsyncLocalStorage } from 'node:async_hooks';

import {
  mergeQueryAttribution,
  type QueryAttribution,
} from '@/query/attribution';

/**
 * The attribution in effect for the current request or job. The auth
 * middleware, alert tasks and MCP tools open a scope; every Couchbase query
 * issued inside it (through `CouchbaseNodeClient` or `executeQuery`) is tagged
 * with it. Node only; the browser uses React context for the same job.
 */
const attributionStore = new AsyncLocalStorage<QueryAttribution>();

/**
 * Tags every Couchbase query `fn` issues. Wrap the whole request or job, not
 * each query.
 */
export function withQueryAttribution<T>(
  attribution: QueryAttribution,
  fn: () => T,
): T {
  const merged = mergeQueryAttribution(
    attributionStore.getStore(),
    attribution,
  );
  return attributionStore.run(merged, fn);
}

/** What is in effect right now, if anything. */
export function getCurrentQueryAttribution(): QueryAttribution | undefined {
  return attributionStore.getStore();
}
