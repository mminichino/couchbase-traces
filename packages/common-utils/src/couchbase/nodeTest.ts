// Server only: the Couchbase SDK is a native addon.
import type { Cluster } from 'couchbase';

import {
  CouchbaseQueryError,
  describeSdkError,
  fromSdkError,
  serialize,
  type SerializedQueryError,
} from './errors';
import {
  caFiles,
  connectCluster,
  type CouchbaseConnectionConfig,
  getCouchbaseLogger,
  secretsOf,
  withTimeout,
} from './nodeCluster';
import {
  type ClusterCache,
  clusterCache,
  type ClusterLease,
} from './nodeClusterCache';
import { keyspace } from './sqlpp';
import type { Keyspace } from './types';

// Connection and keyspace tests
// ---------------------------------------------------------------------------

export type TestResult<T extends object = object> =
  | ({ success: true } & T)
  | { success: false; error: SerializedQueryError };

export async function testConnection(
  conn: Omit<CouchbaseConnectionConfig, 'id' | 'updatedAt'>,
  timeoutMs = 5000,
): Promise<TestResult> {
  const statement = 'SELECT RAW 1';
  const caPath = conn.tlsCaCertificate
    ? caFiles.acquire(conn.tlsCaCertificate)
    : undefined;
  const opened: { cluster: Cluster | null } = { cluster: null };
  const timeoutError = () =>
    new CouchbaseQueryError(
      'TIMEOUT',
      `Connection test timed out after ${timeoutMs} ms`,
      statement,
    );
  try {
    await withTimeout(
      (async () => {
        const cluster = await connectCluster(conn, timeoutMs, caPath);
        opened.cluster = cluster;
        await cluster.query(statement, { timeout: timeoutMs, readOnly: true });
      })(),
      timeoutMs,
      timeoutError,
    );
    return { success: true };
  } catch (e) {
    const err = fromSdkError(e, statement, {
      connecting: true,
      secrets: secretsOf(conn),
    });
    if (err.code === 'TIMEOUT') {
      getCouchbaseLogger().warn(
        {
          sdk: describeSdkError(e, secretsOf(conn)),
          phase: opened.cluster ? 'query' : 'connect',
        },
        'Couchbase connection test timed out',
      );
    }
    return { success: false, error: serialize(err) };
  } finally {
    if (opened.cluster) await opened.cluster.close().catch(() => {});
    if (caPath) caFiles.release(caPath);
  }
}

export const NO_INDEX_MESSAGE =
  'No index can serve this collection yet; create the indexes from docs/indexes.md.';

function isIndexUnavailable(err: CouchbaseQueryError): boolean {
  return (
    err.code === 'INDEX_NOT_FOUND' ||
    err.sqlppCode === 4000 ||
    /no index available/i.test(err.message)
  );
}

/**
 * Sample document ids from a keyspace. Prefer a bare LIMIT scan when a primary
 * (or covering) index exists; on INDEX_NOT_FOUND, fall back to a Timestamp
 * predicate so Capella / secondary-only deployments still pass test-source.
 */
export async function testKeyspace(
  conn: CouchbaseConnectionConfig,
  k: Keyspace,
  timeoutMs: number,
  cache: ClusterCache = clusterCache,
): Promise<TestResult<{ sampleKeys: string[] }>> {
  const ks = keyspace(k);
  const statements = [
    `SELECT RAW META(d).id FROM ${ks} AS d LIMIT 3`,
    `SELECT RAW META(d).id FROM ${ks} AS d WHERE d.\`Timestamp\` IS NOT MISSING LIMIT 3`,
  ];
  let statement = statements[0];
  let lease: ClusterLease | null = null;
  try {
    lease = await withTimeout(
      cache.lease(conn),
      timeoutMs,
      () =>
        new CouchbaseQueryError(
          'TIMEOUT',
          `Connecting to the cluster timed out after ${timeoutMs} ms`,
          statement,
        ),
    );
    let lastIndexErr: CouchbaseQueryError | null = null;
    for (const candidate of statements) {
      statement = candidate;
      try {
        const result = await lease.cluster.query<string>(statement, {
          timeout: timeoutMs,
          readOnly: true,
          adhoc: true,
        });
        return { success: true, sampleKeys: result.rows };
      } catch (e) {
        const err = fromSdkError(e, statement, { secrets: secretsOf(conn) });
        if (isIndexUnavailable(err)) {
          lastIndexErr = err;
          continue;
        }
        return { success: false, error: serialize(err) };
      }
    }
    return {
      success: false,
      error: {
        code: 'INDEX_NOT_FOUND',
        message: NO_INDEX_MESSAGE,
        sqlppCode: lastIndexErr?.sqlppCode ?? null,
      },
    };
  } catch (e) {
    const err = fromSdkError(e, statement, { secrets: secretsOf(conn) });
    if (isIndexUnavailable(err)) {
      return {
        success: false,
        error: {
          code: 'INDEX_NOT_FOUND',
          message: NO_INDEX_MESSAGE,
          sqlppCode: err.sqlppCode,
        },
      };
    }
    return { success: false, error: serialize(err) };
  } finally {
    lease?.release();
  }
}

// ---------------------------------------------------------------------------
