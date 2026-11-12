// Server only: the Couchbase SDK is a native addon.
import type { Cluster } from 'couchbase';

import {
  caFiles,
  type ClusterKey,
  connectCluster,
  type CouchbaseConnectionConfig,
  getCouchbaseLogger,
  getCouchbaseRuntimeConfig,
  type Logger,
} from './nodeCluster';

// ---------------------------------------------------------------------------

type CacheEntry = {
  key: string;
  connectionId: string;
  version: string;
  pending: Promise<Cluster>;
  cluster: Cluster | null;
  caPath?: string;
  lastUsed: number;
  inUse: number;
  retired: boolean;
  idleTimer?: NodeJS.Timeout;
};

export type ClusterLease = { cluster: Cluster; release: () => void };

export type ClusterCacheOptions = {
  maxClusters: number;
  idleMs: number;
  connectTimeoutMs: number;
  logger: Logger;
};

export class ClusterCache {
  private readonly entries = new Map<string, CacheEntry>();
  private resolvedOpts: ClusterCacheOptions | null = null;

  /** A function defers reading configuration until first use. */
  constructor(
    private readonly optsSource:
      | ClusterCacheOptions
      | (() => ClusterCacheOptions),
  ) {}

  private get opts(): ClusterCacheOptions {
    if (this.resolvedOpts == null) {
      this.resolvedOpts =
        typeof this.optsSource === 'function'
          ? this.optsSource()
          : this.optsSource;
    }
    return this.resolvedOpts;
  }

  get size(): number {
    return this.entries.size;
  }

  private static keyOf(k: ClusterKey): string {
    return `${k.connectionId}@${k.version}`;
  }

  async get(conn: CouchbaseConnectionConfig): Promise<Cluster> {
    const lease = await this.lease(conn);
    lease.release();
    return lease.cluster;
  }

  /** Like `get`, but keeps the cluster open until `release` even if retired. */
  async lease(conn: CouchbaseConnectionConfig): Promise<ClusterLease> {
    const key = ClusterCache.keyOf({
      connectionId: conn.id,
      version: conn.updatedAt,
    });
    let entry = this.entries.get(key);
    if (entry == null) {
      for (const other of [...this.entries.values()]) {
        if (other.connectionId === conn.id) this.retire(other);
      }
      while (this.entries.size >= this.opts.maxClusters) {
        const lru = [...this.entries.values()].sort(
          (a, b) => a.lastUsed - b.lastUsed,
        )[0];
        if (!lru) break;
        this.retire(lru);
      }
      entry = this.createEntry(key, conn);
    }
    entry.inUse++;
    this.touch(entry);
    let cluster: Cluster;
    try {
      cluster = await entry.pending;
    } catch (e) {
      entry.inUse--;
      throw e;
    }
    const e = entry;
    let released = false;
    return {
      cluster,
      release: () => {
        if (released) return;
        released = true;
        e.inUse--;
        this.touch(e);
        if (e.retired && e.inUse <= 0) void this.closeEntry(e);
      },
    };
  }

  private createEntry(key: string, conn: CouchbaseConnectionConfig) {
    const caPath = conn.tlsCaCertificate
      ? caFiles.acquire(conn.tlsCaCertificate)
      : undefined;
    const connecting = connectCluster(conn, this.opts.connectTimeoutMs, caPath);
    const entry: CacheEntry = {
      key,
      connectionId: conn.id,
      version: conn.updatedAt,
      cluster: null,
      caPath,
      lastUsed: Date.now(),
      inUse: 0,
      retired: false,
      pending: connecting,
    };
    entry.pending = connecting.then(
      cluster => {
        entry.cluster = cluster;
        if (entry.retired && entry.inUse <= 0) void this.closeEntry(entry);
        return cluster;
      },
      err => {
        // A failed connect is not cached.
        if (this.entries.get(key) === entry) this.entries.delete(key);
        if (entry.caPath) {
          caFiles.release(entry.caPath);
          entry.caPath = undefined;
        }
        throw err;
      },
    );
    // Callers observe the rejection; this keeps an unobserved one quiet.
    entry.pending.catch(() => {});
    this.entries.set(key, entry);
    return entry;
  }

  private touch(entry: CacheEntry) {
    entry.lastUsed = Date.now();
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    if (entry.retired) return;
    entry.idleTimer = setTimeout(() => {
      if (entry.inUse > 0) {
        this.touch(entry);
        return;
      }
      this.opts.logger.debug(
        { connectionId: entry.connectionId },
        'Closing idle Couchbase cluster',
      );
      this.retire(entry);
    }, this.opts.idleMs);
    entry.idleTimer.unref?.();
  }

  private retire(entry: CacheEntry) {
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
    entry.retired = true;
    if (entry.idleTimer) clearTimeout(entry.idleTimer);
    if (entry.inUse <= 0) void this.closeEntry(entry);
  }

  private async closeEntry(entry: CacheEntry) {
    const cluster = entry.cluster;
    entry.cluster = null;
    if (entry.caPath) {
      caFiles.release(entry.caPath);
      entry.caPath = undefined;
    }
    if (cluster) {
      try {
        await cluster.close();
      } catch (e) {
        this.opts.logger.warn(
          { connectionId: entry.connectionId, err: e },
          'Error closing Couchbase cluster',
        );
      }
    }
  }

  async invalidate(connectionId: string): Promise<void> {
    const matching = [...this.entries.values()].filter(
      e => e.connectionId === connectionId,
    );
    await Promise.all(
      matching.map(async e => {
        this.retire(e);
        if (e.inUse <= 0) await this.closeEntry(e);
      }),
    );
  }

  async closeAll(): Promise<void> {
    const all = [...this.entries.values()];
    await Promise.all(
      all.map(async e => {
        this.retire(e);
        await e.pending.catch(() => null);
        await this.closeEntry(e);
      }),
    );
  }
}

/** Process singleton, created lazily from config on first use. */
export const clusterCache: ClusterCache = new ClusterCache(() => {
  const cfg = getCouchbaseRuntimeConfig();
  return {
    maxClusters: cfg.maxClusters,
    idleMs: cfg.clusterIdleMs,
    connectTimeoutMs: cfg.connectTimeoutMs,
    logger: {
      debug: (...a) => getCouchbaseLogger().debug(...a),
      info: (...a) => getCouchbaseLogger().info(...a),
      warn: (...a) => getCouchbaseLogger().warn(...a),
      error: (...a) => getCouchbaseLogger().error(...a),
    },
  };
});
