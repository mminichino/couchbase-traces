import { KvLockService } from '@/metadata/lock';
import { MemoryKv } from '@/metadata/testing/memoryKv';
import type { MetadataReadiness, MetadataStore } from '@/metadata/types';

export type MemoryStore = MetadataStore & { kv: MemoryKv; reset(): void };

/**
 * In-memory MetadataStore for unit tests. Entity repositories are added here
 * in the same phase that adds them to the Couchbase store (C1–C4), and both
 * run testing/contract.ts.
 */
export function createMemoryStore(o: { now?: () => Date } = {}): MemoryStore {
  const kv = new MemoryKv(o.now);
  let state: MetadataReadiness = { ready: true, state: 'ready' };
  return {
    kv,
    locks: new KvLockService(kv, o.now),
    readiness: () => state,
    close: async () => {
      state = { ready: false, state: 'closed' };
    },
    reset: () => {
      kv.clear();
      state = { ready: true, state: 'ready' };
    },
  };
}
