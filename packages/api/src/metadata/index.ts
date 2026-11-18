import {
  isMetadataConfigured,
  loadMetadataConfig,
} from '@/metadata/couchbase/config';
import {
  CouchbaseMetadataStore,
  type StoreLogger,
} from '@/metadata/couchbase/store';
import { MetadataUnavailableError } from '@/metadata/errors';
import type { MetadataReadiness, MetadataStore } from '@/metadata/types';

export * from '@/metadata/errors';
export * from '@/metadata/ids';
export type * from '@/metadata/types';

let store: MetadataStore | null = null;

/**
 * The metadata store for this process. Couchbase in servers, memory in unit
 * tests (setMetadataStoreForTests). Throws while disabled, so a caller that
 * was switched in C1+ fails loudly instead of silently reading nothing.
 */
export function getMetadataStore(): MetadataStore {
  if (!store) throw new MetadataUnavailableError('metadata store is disabled');
  return store;
}

export function setMetadataStoreForTests(next: MetadataStore | null): void {
  store = next;
}

const DISABLED: MetadataReadiness = { ready: false, state: 'disabled' };

export function metadataReadiness(): MetadataReadiness {
  return store?.readiness() ?? DISABLED;
}

/**
 * True when /ready may pass. Until C1 moves the first entity, an API without
 * CBT_METADATA_* credentials runs with the store disabled and is not held
 * back by it; a configured store must be ready.
 */
export function isMetadataReadyOrDisabled(): boolean {
  const r = metadataReadiness();
  return r.ready || r.state === 'disabled';
}

export async function startMetadataStore(
  o: {
    env?: Record<string, string | undefined>;
    logger?: StoreLogger;
    appVersion?: string;
  } = {},
): Promise<void> {
  const env = o.env ?? process.env;
  if (!isMetadataConfigured(env)) {
    o.logger?.warn(
      {},
      'Metadata store disabled: set CBT_METADATA_USER and CBT_METADATA_PASSWORD',
    );
    return;
  }
  const next = new CouchbaseMetadataStore(loadMetadataConfig(env), {
    logger: o.logger,
    appVersion: o.appVersion,
  });
  store = next;
  await next.start();
}

export async function closeMetadataStore(): Promise<void> {
  const current = store;
  store = null;
  await current?.close();
}
