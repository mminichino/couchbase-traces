import { loadMetadataConfig } from '@/metadata/couchbase/config';
import {
  CouchbaseMetadataStore,
  type StoreLogger,
} from '@/metadata/couchbase/store';
import { MetadataUnavailableError } from '@/metadata/errors';
import type {
  MetaCollection,
  MetadataReadiness,
  MetadataStore,
} from '@/metadata/types';

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

/** True when /ready may pass: identity lives here since C1. */
export function isMetadataReady(): boolean {
  return metadataReadiness().ready;
}

/**
 * Throws MetadataConfigError naming the missing or malformed CBT_METADATA_*
 * variable. Called at startup before anything else connects (fail fast).
 */
export function assertMetadataConfig(
  env: Record<string, string | undefined> = process.env,
): void {
  loadMetadataConfig(env);
}

export async function startMetadataStore(
  o: {
    env?: Record<string, string | undefined>;
    logger?: StoreLogger;
    appVersion?: string;
  } = {},
): Promise<void> {
  const env = o.env ?? process.env;
  // Throws MetadataConfigError naming the missing variable (fail fast, C1).
  const cfg = loadMetadataConfig(env);
  // Integration fixtures may have started one already; never leak it.
  await store?.close();
  const next = new CouchbaseMetadataStore(cfg, {
    logger: o.logger,
    appVersion: o.appVersion,
  });
  store = next;
  await next.start();
}

/** Collections migrated off Mongo so far; integration tests empty these. */
export const MIGRATED_COLLECTIONS = [
  'teams',
  'users',
  'team_invites',
  'unique_keys',
  'sessions',
] as const satisfies readonly MetaCollection[];

/** Integration tests only: empties the migrated collections. */
export async function clearMetadataForTests(): Promise<void> {
  if (!store) return;
  if (store instanceof CouchbaseMetadataStore) {
    await store.clearForTests(MIGRATED_COLLECTIONS);
  } else if ('reset' in store && typeof store.reset === 'function') {
    store.reset();
  }
}

export async function closeMetadataStore(): Promise<void> {
  const current = store;
  store = null;
  await current?.close();
}
