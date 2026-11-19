import { type Cluster, DocumentNotFoundError, RangeScan } from 'couchbase';

import { collectionOf, connectWithRetry } from '@/metadata/couchbase/cluster';
import type { MetadataConfig } from '@/metadata/couchbase/config';
import { CouchbaseAlertQueries } from '@/metadata/couchbase/alertQueries';
import { CouchbaseFind } from '@/metadata/couchbase/find';
import { CouchbaseKv } from '@/metadata/couchbase/kv';
import {
  CouchbaseTransactions,
  probeTransactions,
} from '@/metadata/couchbase/tx';
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
  MetaAlertQueries,
  MetaFind,
  MetaKv,
  MetaTransactions,
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
  private txImpl?: MetaTransactions;
  private queriesImpl?: MetaAlertQueries;
  private state: MetadataReadiness = { ready: false, state: 'connecting' };
  private readonly abort = new AbortController();
  private poll?: NodeJS.Timeout;

  readonly teams: Repositories['teams'];
  readonly users: Repositories['users'];
  readonly teamInvites: Repositories['teamInvites'];
  readonly connections: Repositories['connections'];
  readonly sources: Repositories['sources'];
  readonly savedSearches: Repositories['savedSearches'];
  readonly dashboards: Repositories['dashboards'];
  readonly favorites: Repositories['favorites'];
  readonly pinnedFilters: Repositories['pinnedFilters'];
  readonly presetDashboardFilters: Repositories['presetDashboardFilters'];
  readonly webhooks: Repositories['webhooks'];
  readonly tags: Repositories['tags'];
  readonly alerts: Repositories['alerts'];
  readonly alertHistory: Repositories['alertHistory'];

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
      get tx() {
        return self.tx;
      },
      get queries() {
        return self.alertQueries;
      },
    });
    this.teams = repos.teams;
    this.users = repos.users;
    this.teamInvites = repos.teamInvites;
    this.connections = repos.connections;
    this.sources = repos.sources;
    this.savedSearches = repos.savedSearches;
    this.dashboards = repos.dashboards;
    this.favorites = repos.favorites;
    this.pinnedFilters = repos.pinnedFilters;
    this.presetDashboardFilters = repos.presetDashboardFilters;
    this.webhooks = repos.webhooks;
    this.tags = repos.tags;
    this.alerts = repos.alerts;
    this.alertHistory = repos.alertHistory;
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

  get tx(): MetaTransactions {
    if (!this.txImpl) {
      throw new MetadataUnavailableError('metadata not connected');
    }
    return this.txImpl;
  }

  get alertQueries(): MetaAlertQueries {
    if (!this.queriesImpl) {
      throw new MetadataUnavailableError('metadata not connected');
    }
    return this.queriesImpl;
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
    this.txImpl = new CouchbaseTransactions(this.cluster, this.cfg);
    this.queriesImpl = new CouchbaseAlertQueries(this.cluster, this.cfg);
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
