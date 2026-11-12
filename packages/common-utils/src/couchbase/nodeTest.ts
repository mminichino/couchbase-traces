// Server only: the Couchbase SDK is a native addon.
import type { Cluster } from 'couchbase';

import {
  CouchbaseQueryError,
  fromSdkError,
  serialize,
  type SerializedQueryError,
} from './errors';
import {
  caFiles,
  connectCluster,
  type CouchbaseConnectionConfig,
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
    return {
      success: false,
      error: serialize(
        fromSdkError(e, statement, {
          connecting: true,
          secrets: secretsOf(conn),
        }),
      ),
    };
  } finally {
    if (opened.cluster) await opened.cluster.close().catch(() => {});
    if (caPath) caFiles.release(caPath);
  }
}

export const NO_INDEX_MESSAGE =
  'No index can serve this collection yet; create the indexes from docs/indexes.md.';

export async function testKeyspace(
  conn: CouchbaseConnectionConfig,
  k: Keyspace,
  timeoutMs: number,
  cache: ClusterCache = clusterCache,
): Promise<TestResult<{ sampleKeys: string[] }>> {
  let statement = '';
  let lease: ClusterLease | null = null;
  try {
    statement = `SELECT RAW META(d).id FROM ${keyspace(k)} AS d LIMIT 3`;
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
    const result = await lease.cluster.query<string>(statement, {
      timeout: timeoutMs,
      readOnly: true,
      adhoc: true,
    });
    return { success: true, sampleKeys: result.rows };
  } catch (e) {
    const err = fromSdkError(e, statement, { secrets: secretsOf(conn) });
    if (
      err.code === 'INDEX_NOT_FOUND' ||
      err.sqlppCode === 4000 ||
      /no index available/i.test(err.message)
    ) {
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
