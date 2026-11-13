export type ConnectionKind = 'clickhouse' | 'couchbase';

export type ConnectionKindResolver = (
  connectionId: string,
) => Promise<ConnectionKind | undefined>;

const CACHE_MS = 30_000;

type CacheEntry = { kind: ConnectionKind; expires: number };

type KindState = {
  resolver?: ConnectionKindResolver;
  cache: Map<string, CacheEntry>;
  inflight: Map<string, Promise<ConnectionKind>>;
  warned: Set<string>;
};

// tsup bundles each entry separately, so a module-level Map would be a
// different object in the browser client and in the renderer. One slot on
// globalThis keeps registration and lookup on the same cache.
const STATE_FIELD = '__couchbaseTracesConnectionKind';

function state(): KindState {
  const box = kindBox();
  if (box.current == null) {
    box.current = {
      cache: new Map(),
      inflight: new Map(),
      warned: new Set(),
    };
  }
  return box.current;
}

function kindBox(): { current?: KindState } {
  const existing = Object.getOwnPropertyDescriptor(globalThis, STATE_FIELD);
  if (existing != null && isKindBox(existing.value)) return existing.value;
  const created: { current?: KindState } = {};
  Object.defineProperty(globalThis, STATE_FIELD, {
    value: created,
    writable: true,
    configurable: true,
  });
  return created;
}

function isKindBox(value: unknown): value is { current?: KindState } {
  return value != null && typeof value === 'object' && 'current' in value;
}

export function setConnectionKindResolver(r: ConnectionKindResolver): void {
  state().resolver = r;
}

/** Test hook. Production code uses the registered resolver. */
export function resetConnectionKindState(): void {
  const current = state();
  current.resolver = undefined;
  current.cache.clear();
  current.inflight.clear();
  current.warned.clear();
}

export function primeConnectionKind(
  connectionId: string,
  kind: ConnectionKind,
): void {
  state().cache.set(connectionId, { kind, expires: Date.now() + CACHE_MS });
}

export function clearConnectionKindCache(connectionId?: string): void {
  const current = state();
  if (connectionId == null) {
    current.cache.clear();
    current.inflight.clear();
    return;
  }
  current.cache.delete(connectionId);
  current.inflight.delete(connectionId);
}

/**
 * Absent id, no resolver, or a resolver result of `undefined` stay on
 * ClickHouse so local mode and connection-less calls keep their behavior.
 * A thrown resolver is not cached.
 */
export async function resolveConnectionKind(
  connectionId: string | undefined,
): Promise<ConnectionKind> {
  const current = state();
  if (!connectionId) return 'clickhouse';
  const hit = current.cache.get(connectionId);
  if (hit != null && hit.expires > Date.now()) return hit.kind;
  if (current.resolver == null) return 'clickhouse';
  const pending = current.inflight.get(connectionId);
  if (pending) return pending;

  const resolver = current.resolver;
  const promise = lookup(resolver, connectionId);
  current.inflight.set(connectionId, promise);
  return promise;
}

async function lookup(
  current: ConnectionKindResolver,
  connectionId: string,
): Promise<ConnectionKind> {
  try {
    const kind = (await current(connectionId)) ?? 'clickhouse';
    state().cache.set(connectionId, { kind, expires: Date.now() + CACHE_MS });
    return kind;
  } catch (err) {
    const currentState = state();
    if (!currentState.warned.has(connectionId)) {
      currentState.warned.add(connectionId);
      console.warn(
        `Connection kind lookup failed for ${connectionId}; using clickhouse`,
        err,
      );
    }
    return 'clickhouse';
  } finally {
    state().inflight.delete(connectionId);
  }
}
