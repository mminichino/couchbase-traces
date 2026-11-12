// Server only: the Couchbase SDK is a native addon.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { type Cluster, type ConnectOptions } from 'couchbase';
import * as couchbase from 'couchbase';

import { resolveWanProfile } from './connstr';
import { CouchbaseQueryError } from './errors';
import type { CouchbaseLogger } from './types';

export type Logger = CouchbaseLogger;

export type ClusterKey = { connectionId: string; version: string };

export type CouchbaseConnectionConfig = {
  id: string;
  host: string;
  username: string;
  password?: string;
  wanProfile?: boolean;
  tlsCaCertificate?: string;
  /** connection.updatedAt ISO string */
  updatedAt: string;
};

export type CouchbaseRuntimeConfig = {
  defaultTimeoutMs: number;
  maxTimeoutMs: number;
  connectTimeoutMs: number;
  clusterIdleMs: number;
  maxClusters: number;
  maxBufferedBytes: number;
  frameRows: number;
};

function envInt(name: string, fallback: number): number {
  const raw: unknown = Reflect.get(process.env, name);
  const n =
    typeof raw === 'string' && raw !== '' ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Read at call time so tests and the API config see the same values. */
export function getCouchbaseRuntimeConfig(): CouchbaseRuntimeConfig {
  return {
    defaultTimeoutMs: envInt('CBT_COUCHBASE_DEFAULT_TIMEOUT_MS', 60000),
    maxTimeoutMs: envInt('CBT_COUCHBASE_MAX_TIMEOUT_MS', 600000),
    connectTimeoutMs: envInt('CBT_COUCHBASE_CONNECT_TIMEOUT_MS', 10000),
    clusterIdleMs: envInt('CBT_COUCHBASE_CLUSTER_IDLE_MS', 600000),
    maxClusters: envInt('CBT_COUCHBASE_MAX_CLUSTERS', 50),
    maxBufferedBytes: envInt('CBT_COUCHBASE_MAX_BUFFERED_BYTES', 268435456),
    frameRows: envInt('CBT_COUCHBASE_FRAME_ROWS', 500),
  };
}

export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

export function secretsOf(conn: {
  password?: string;
  tlsCaCertificate?: string;
}) {
  return [conn.password ?? '', conn.tlsCaCertificate ?? ''];
}

// ---------------------------------------------------------------------------
// CA certificate files
// ---------------------------------------------------------------------------

/* eslint-disable security/detect-non-literal-fs-filename -- paths come from mkdtemp and a sha256 file name */
/** PEM files the SDK reads by path; one per distinct certificate, ref-counted. */
class CaFileStore {
  private dir: string | null = null;
  private refs = new Map<string, number>();

  private ensureDir(): string {
    if (this.dir == null || !fs.existsSync(this.dir)) {
      this.dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cbt-couchbase-ca-'));
      fs.chmodSync(this.dir, 0o700);
    }
    return this.dir;
  }

  acquire(pem: string): string {
    const name = `${createHash('sha256').update(pem).digest('hex')}.pem`;
    const file = path.join(this.ensureDir(), name);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, pem, { mode: 0o600 });
    }
    this.refs.set(file, (this.refs.get(file) ?? 0) + 1);
    return file;
  }

  release(file: string): void {
    const n = (this.refs.get(file) ?? 1) - 1;
    if (n > 0) {
      this.refs.set(file, n);
      return;
    }
    this.refs.delete(file);
    try {
      fs.unlinkSync(file);
    } catch {
      // already gone
    }
  }
}

/* eslint-enable security/detect-non-literal-fs-filename */

export const caFiles = new CaFileStore();

export async function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  onTimeout: () => Error,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(onTimeout()), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function connectCluster(
  conn: Omit<CouchbaseConnectionConfig, 'id' | 'updatedAt'>,
  connectTimeoutMs: number,
  caPath: string | undefined,
): Promise<Cluster> {
  const options: ConnectOptions = {
    username: conn.username,
    password: conn.password ?? '',
    timeouts: { connectTimeout: connectTimeoutMs },
  };
  if (resolveWanProfile(conn.host, conn.wanProfile)) {
    options.configProfile = 'wanDevelopment';
  }
  if (caPath) {
    options.security = { trustStorePath: caPath };
  }
  const pending = couchbase.connect(conn.host, options);
  try {
    return await withTimeout(
      pending,
      connectTimeoutMs,
      () =>
        new CouchbaseQueryError(
          'TIMEOUT',
          `Connecting to the cluster timed out after ${connectTimeoutMs} ms`,
          '',
        ),
    );
  } catch (e) {
    // A connect that finishes after the timeout must not leak.
    pending.then(c => c.close()).catch(() => {});
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Cluster cache

let currentLogger: Logger = noopLogger;

/** Sets the logger the process-wide cache and executor use. */
export function setCouchbaseLogger(logger: Logger): void {
  currentLogger = logger;
}

export function getCouchbaseLogger(): Logger {
  return currentLogger;
}
