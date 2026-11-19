import { type Cluster, DocumentNotFoundError, RangeScan } from 'couchbase';

import { collectionOf, connectWithRetry } from '@/metadata/couchbase/cluster';
import type { MetadataConfig } from '@/metadata/couchbase/config';
import { CouchbaseFind } from '@/metadata/couchbase/find';
import { CouchbaseKv } from '@/metadata/couchbase/kv';
import { probeTransactions } from '@/metadata/couchbase/tx';
import {
  describeVerify,
  type VerifyDeps,
  verifyOrProvision,
} from '@/metadata/couchbase/verify';
import { MetadataUnavailableError } from '@/metadata/errors';
import { KvLockService } from '@/metadata/lock';
import { createRepositories, type Repositories } from '@/metadata/repos';
import { assertSchemaVersion } from '@/metadata/schemaVersion';
import type {
  LockService,
  MetaCollection,
  MetadataReadiness,
  MetadataStore,
  MetaFind,
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
  private findImpl?: CouchbaseFind;
  private lockImpl?: LockService;
  private state: MetadataReadiness = { ready: false, state: 'connecting' };
  private readonly abort = new AbortController();
  private poll?: NodeJS.Timeout;

  readonly teams: Repositories['teams'];
  readonly users: Repositories['users'];
  readonly teamInvites: Repositories['teamInvites'];
  readonly connections: Repositories['connections'];
  readonly sources: Repositories['sources'];

  constructor(
    private readonly cfg: MetadataConfig,
    private readonly deps: CouchbaseStoreDeps = {},
  ) {
    // Getters, so a repository used before start() fails as unavailable.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this;
    const repos = createRepositories({
      get kv() {
        return self.kv;
      },
      get find() {
        return self.find;
      },
    });
    this.teams = repos.teams;
    this.users = repos.users;
    this.teamInvites = repos.teamInvites;
    this.connections = repos.connections;
    this.sources = repos.sources;
  }

  get kv(): MetaKv {
    if (!this.kvImpl)
      throw new MetadataUnavailableError('metadata not connected');
    return this.kvImpl;
  }

  get find(): MetaFind {
    if (!this.findImpl) {
      throw new MetadataUnavailableError('metadata not connected');
    }
    return this.findImpl;
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
    this.findImpl = new CouchbaseFind(this.cluster, this.cfg);
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

  /**
   * Integration-test reset. A KV range scan needs no primary index, which
   * the metadata keyspace deliberately does not have.
   */
  async clearForTests(collections: readonly MetaCollection[]): Promise<void> {
    const cluster = this.cluster;
    if (!cluster) throw new MetadataUnavailableError('metadata not connected');
    await Promise.all(
      collections.map(async name => {
        const coll = collectionOf(cluster, this.cfg, name);
        const found = await coll.scan(new RangeScan(), { idsOnly: true });
        await Promise.all(
          found.map(r =>
            coll.remove(r.id).catch(err => {
              if (!(err instanceof DocumentNotFoundError)) throw err;
            }),
          ),
        );
      }),
    );
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
