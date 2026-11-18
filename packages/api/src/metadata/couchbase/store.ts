import type { Cluster } from 'couchbase';

import { connectWithRetry } from '@/metadata/couchbase/cluster';
import type { MetadataConfig } from '@/metadata/couchbase/config';
import { CouchbaseKv } from '@/metadata/couchbase/kv';
import { probeTransactions } from '@/metadata/couchbase/tx';
import {
  describeVerify,
  type VerifyDeps,
  verifyOrProvision,
} from '@/metadata/couchbase/verify';
import { MetadataUnavailableError } from '@/metadata/errors';
import { KvLockService } from '@/metadata/lock';
import { assertSchemaVersion } from '@/metadata/schemaVersion';
import type {
  LockService,
  MetadataReadiness,
  MetadataStore,
  MetaKv,
} from '@/metadata/types';

export type StoreLogger = {
  info: (obj: object, msg: string) => void;
  warn: (obj: object, msg: string) => void;
  error: (obj: object, msg: string) => void;
};

export type CouchbaseStoreDeps = VerifyDeps & {
  connect?: typeof connectWithRetry;
  probe?: typeof probeTransactions;
  logger?: StoreLogger;
  appVersion?: string;
  /** Delay between keyspace re-checks while provisioning or indexing. */
  pollMs?: number;
};

const silent: StoreLogger = { info: () => {}, warn: () => {}, error: () => {} };

/**
 * Production MetadataStore. start() connects (retrying), refuses a newer
 * schema, verifies or provisions the keyspace, and probes transactions.
 * Readiness moves connecting → provisioning|indexing → ready (or degraded).
 */
export class CouchbaseMetadataStore implements MetadataStore {
  private cluster?: Cluster;
  private kvImpl?: CouchbaseKv;
  private lockImpl?: LockService;
  private state: MetadataReadiness = { ready: false, state: 'connecting' };
  private readonly abort = new AbortController();
  private poll?: NodeJS.Timeout;

  constructor(
    private readonly cfg: MetadataConfig,
    private readonly deps: CouchbaseStoreDeps = {},
  ) {}

  get kv(): MetaKv {
    if (!this.kvImpl)
      throw new MetadataUnavailableError('metadata not connected');
    return this.kvImpl;
  }

  get locks(): LockService {
    if (!this.lockImpl) {
      throw new MetadataUnavailableError('metadata not connected');
    }
    return this.lockImpl;
  }

  /** For repositories that need SQL++ or transactions (C1+). */
  get rawCluster(): Cluster {
    if (!this.cluster) {
      throw new MetadataUnavailableError('metadata not connected');
    }
    return this.cluster;
  }

  readiness(): MetadataReadiness {
    return this.state;
  }

  private get log(): StoreLogger {
    return this.deps.logger ?? silent;
  }

  /** Rejects only on non-retryable failures (config, newer schema). */
  async start(): Promise<void> {
    const connect = this.deps.connect ?? connectWithRetry;
    this.cluster = await connect(this.cfg, {
      signal: this.abort.signal,
      onRetry: (err, attempt, retryInMs) =>
        this.log.error(
          { err: err.message, attempt, retryInMs },
          'Metadata cluster connection failed, retrying',
        ),
    });
    this.kvImpl = new CouchbaseKv(this.cluster, this.cfg);
    this.lockImpl = new KvLockService(this.kvImpl);
    await assertSchemaVersion(this.kvImpl);
    await this.check();
  }

  private async check(): Promise<void> {
    if (this.abort.signal.aborted || !this.cluster) return;
    try {
      const result = await verifyOrProvision(
        this.cluster,
        this.cfg,
        { ...this.deps, log: line => this.log.info({}, line) },
        this.deps.appVersion,
      );
      if (!result.ok) {
        this.state = {
          ready: false,
          state: result.missing.length > 0 ? 'provisioning' : 'indexing',
          detail: describeVerify(result),
        };
        this.log.warn(
          { detail: this.state.detail },
          'Metadata keyspace not ready',
        );
        this.schedule();
        return;
      }
      // Provisioning may have just written the marker; check it again.
      await assertSchemaVersion(this.kv);
      await (this.deps.probe ?? probeTransactions)(this.cluster, this.cfg);
      this.state = { ready: true, state: 'ready' };
      this.log.info({ bucket: this.cfg.bucket }, 'Metadata store ready');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof Error && err.name === 'SchemaVersionError') throw err;
      this.state = { ready: false, state: 'degraded', detail: [message] };
      this.log.error({ err: message }, 'Metadata store degraded');
      this.schedule();
    }
  }

  private schedule(): void {
    if (this.abort.signal.aborted) return;
    this.poll = setTimeout(() => {
      this.check().catch(err =>
        this.log.error({ err: String(err) }, 'Metadata check failed'),
      );
    }, this.deps.pollMs ?? 5000);
    this.poll.unref();
  }

  async close(): Promise<void> {
    this.abort.abort();
    if (this.poll) clearTimeout(this.poll);
    this.state = { ready: false, state: 'closed' };
    const cluster = this.cluster;
    this.cluster = undefined;
    await cluster?.close();
  }
}
