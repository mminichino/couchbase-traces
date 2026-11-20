/**
 * Shared setup for the renderer tests that run against the cluster started by
 * port/couchbase-test/run.sh (CBT_TEST_COUCHBASE_*). Collections live in
 * `test`.`app`; every suite seeds its own.
 */
import type { ChartConfigWithOptDateRangeEx } from '@/core/chartConfig';
import type { CouchbaseConnectionConfig } from '@/couchbase/node';
import { CouchbaseNodeClient, testConnection } from '@/couchbase/node';
import { renderChartConfigCouchbase } from '@/couchbase/render';

const CONNSTR =
  process.env.CBT_TEST_COUCHBASE_CONNSTR || 'couchbase://localhost';
const REQUIRED = process.env.CBT_TEST_COUCHBASE_REQUIRED === '1';
const ADMIN_USER = process.env.CBT_TEST_COUCHBASE_ADMIN_USER || 'Administrator';
const ADMIN_PASSWORD =
  process.env.CBT_TEST_COUCHBASE_ADMIN_PASSWORD || 'cbt-test-admin';

export const ks = (c: string) => `\`test\`.\`app\`.\`${c}\``;

export function liveConnection(id: string): CouchbaseConnectionConfig {
  return {
    id,
    host: CONNSTR,
    username: ADMIN_USER,
    password: ADMIN_PASSWORD,
    wanProfile: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

/** True when the cluster answers; throws instead when the run requires it. */
export async function probeLive(
  conn: CouchbaseConnectionConfig,
): Promise<boolean> {
  const probe = await testConnection(conn, 15000);
  if (probe.success) return true;
  const msg = `Couchbase integration tests skipped: ${probe.error.message}`;
  if (REQUIRED) throw new Error(msg);
  console.warn(msg);
  return false;
}

function queryPort(): number {
  return 8093 + Number(process.env.CBT_TEST_COUCHBASE_PORT_OFFSET || 0);
}

/** Runs a statement on the query REST endpoint as the cluster admin. */
export async function adminMutate(
  statement: string,
  named?: Record<string, unknown>,
) {
  const payload: Record<string, unknown> = { statement };
  for (const [k, v] of Object.entries(named ?? {})) payload[`$${k}`] = v;
  const auth = Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`).toString(
    'base64',
  );
  const res = await fetch(`http://127.0.0.1:${queryPort()}/query/service`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as {
    status?: string;
    errors?: unknown;
    results?: unknown[];
  };
  if (body.status !== 'success') {
    throw new Error(`mutate failed: ${JSON.stringify(body.errors ?? body)}`);
  }
  return body.results ?? [];
}

/** Creates (or empties) a collection with a primary index. */
export async function ensureCollection(name: string) {
  for (let i = 0; ; i++) {
    try {
      await adminMutate(`CREATE COLLECTION ${ks(name)} IF NOT EXISTS`);
      await adminMutate(`CREATE PRIMARY INDEX IF NOT EXISTS ON ${ks(name)}`);
      await adminMutate(`DELETE FROM ${ks(name)}`);
      return;
    } catch (err) {
      // DDL can 12003 until the query service sees a new scope/collection.
      if (i >= 30) throw err;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

export async function seed(
  collection: string,
  docs: Record<string, unknown>[],
) {
  for (const [i, v] of docs.entries()) {
    await adminMutate(
      `UPSERT INTO ${ks(collection)} (KEY, VALUE) VALUES ($k, $v)`,
      { k: `${collection}:${i}`, v },
    );
  }
  // The primary index is eventually consistent after UPSERT.
  for (let i = 0; i < 50; i++) {
    const [n] = await adminMutate(`SELECT RAW COUNT(*) FROM ${ks(collection)}`);
    if (Number(n) >= docs.length) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`${collection}: seeded docs not visible`);
}

/** Executes rendered SQL++ with the test scope as query context. */
export async function runSql(
  conn: CouchbaseConnectionConfig,
  sql: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const result = await new CouchbaseNodeClient({ conn, team: null }).query({
    query: sql,
    query_params: params,
    format: 'JSON',
    queryContext: { bucket: 'test', scope: 'app' },
  });
  return (await result.json<Record<string, unknown>>()).data;
}

/** Renders a builder chart config and executes it. */
export async function runChart(
  conn: CouchbaseConnectionConfig,
  config: unknown,
): Promise<Record<string, unknown>[]> {
  const q = await renderChartConfigCouchbase(
    config as ChartConfigWithOptDateRangeEx,
    { getColumns: async () => [] },
    undefined,
  );
  return runSql(conn, q.sql, q.params);
}
