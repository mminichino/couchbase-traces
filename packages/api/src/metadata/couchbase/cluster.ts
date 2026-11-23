import { dnsConfig } from '@couchbase-traces/common-utils/dist/couchbase/dnsConfig';
import {
  type Cluster,
  type Collection,
  connect,
  type ConnectOptions,
  DurabilityLevel,
} from 'couchbase';

import type { MetadataConfig } from '@/metadata/couchbase/config';
import { metaCollection } from '@/metadata/couchbase/keyspace';
import { fromCouchbaseError, MetadataConfigError } from '@/metadata/errors';
import type { MetaCollection } from '@/metadata/types';

export type ConnectRetryOptions = {
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
  /** Stops retrying (shutdown during startup). */
  signal?: AbortSignal;
  onRetry?: (err: Error, attempt: number, retryInMs: number) => void;
};

export function connectOptions(cfg: MetadataConfig): ConnectOptions {
  const options: ConnectOptions = {
    username: cfg.username,
    password: cfg.password,
    timeouts: {
      connectTimeout: 10_000,
      kvTimeout: cfg.kvTimeoutMs,
      queryTimeout: cfg.queryTimeoutMs,
    },
    // SDK default SRV budget (500 ms) fails the connect on one slow DNS
    // answer for a single-hostname connstr (D18).
    dnsConfig: dnsConfig(),
    transactions: {
      durabilityLevel:
        cfg.txDurability === 'none'
          ? DurabilityLevel.None
          : DurabilityLevel.Majority,
      timeout: cfg.txTimeoutMs,
      // ATRs and client records stay out of the entity collections (D9).
      metadataCollection: {
        bucket: cfg.bucket,
        scope: cfg.scope,
        collection: 'txn_meta',
      },
    },
  };
  if (cfg.wanProfile) options.configProfile = 'wanDevelopment';
  if (cfg.caCertPath) options.security = { trustStorePath: cfg.caCertPath };
  return options;
}

type Connect = (connstr: string, o: ConnectOptions) => Promise<Cluster>;

/**
 * Retries with capped exponential backoff, like connectDBWithRetry. Bad
 * credentials and a missing bucket are retried too: operators often create
 * them after the API starts.
 */
export async function connectWithRetry(
  cfg: MetadataConfig,
  retry: ConnectRetryOptions = {},
  doConnect: Connect = connect,
): Promise<Cluster> {
  const base = retry.baseDelayMs ?? 1000;
  const max = retry.maxDelayMs ?? 30_000;
  const attempts = retry.maxAttempts ?? Infinity;
  for (let attempt = 1; ; attempt++) {
    if (retry.signal?.aborted) {
      throw new MetadataConfigError('metadata connect aborted');
    }
    try {
      const cluster = await doConnect(cfg.connstr, connectOptions(cfg));
      // connect() succeeds before the bucket is known to exist. Unlike the
      // collections REST API, this needs only the data roles the user has.
      await cluster.bucket(cfg.bucket).waitUntilReady(10_000);
      return cluster;
    } catch (err) {
      const mapped = fromCouchbaseError(err, { secrets: [cfg.password] });
      if (attempt >= attempts) throw mapped;
      const retryInMs = Math.min(base * 2 ** (attempt - 1), max);
      retry.onRetry?.(mapped, attempt, retryInMs);
      await new Promise(resolve => setTimeout(resolve, retryInMs));
    }
  }
}

export function collectionOf(
  cluster: Cluster,
  cfg: Pick<MetadataConfig, 'bucket' | 'scope'>,
  name: MetaCollection,
): Collection {
  const ks = metaCollection(cfg, name);
  return cluster.bucket(ks.bucket).scope(ks.scope).collection(ks.collection);
}
