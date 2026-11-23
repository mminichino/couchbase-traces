/**
 * Shared setup for the renderer tests that run against the cluster started by
 * port/couchbase-test/run.sh (CBT_TEST_COUCHBASE_*). Collections live in
 * `test`.`app`; every suite seeds its own.
 */
import type { ChartConfigWithOptDateRangeEx } from '@/core/chartConfig';
import type { CouchbaseConnectionConfig } from '@/couchbase/node';
import {
  CouchbaseNodeClient,
  setCouchbaseLogger,
  testConnection,
} from '@/couchbase/node';
import { renderChartConfigCouchbase } from '@/couchbase/render';

// Live suites otherwise run with the no-op logger, which drops the SDK
// context the executor and probe log on a TIMEOUT (D18).
setCouchbaseLogger({
  debug: () => {},
  info: () => {},
  warn: (...args: unknown[]) => console.warn('[couchbase]', ...args),
  error: (...args: unknown[]) => console.error('[couchbase]', ...args),
});

const CONNSTR =
  process.env.CBT_TEST_COUCHBASE_CONNSTR || 'couchbase://localhost';
const ADMIN_USER = process.env.CBT_TEST_COUCHBASE_ADMIN_USER || 'Administrator';
const ADMIN_PASSWORD =
  process.env.CBT_TEST_COUCHBASE_ADMIN_PASSWORD || 'cbt-test-admin';

/**
 * `CBT_TEST_COUCHBASE_REQUIRED`: `1` (port/couchbase-test/run.sh) fails the
 * run when the cluster is unreachable; `0` (make ci-int, make dev-int, CI's
 * int job) skips without probing, because those stacks have no `test` bucket;
 * unset probes and skips with a warning.
 */
export type LiveMode = 'required' | 'off' | 'probe';

export function liveMode(
  value = process.env.CBT_TEST_COUCHBASE_REQUIRED,
): LiveMode {
  if (value === '1') return 'required';
  if (value === '0') return 'off';
  return 'probe';
}

export function intentionalSkipNotice(suite: string): string {
  return `${suite}: skipped on purpose (CBT_TEST_COUCHBASE_REQUIRED=0); it runs in port/couchbase-test/run.sh.`;
}

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

/**
 * True when the cluster answers. With mode `off` it logs one notice and
 * returns false without connecting; with `required` an unreachable cluster
 * throws.
 */
export async function probeLive(
  conn: CouchbaseConnectionConfig,
  suite = 'Couchbase live-cluster suite',
  mode: LiveMode = liveMode(),
): Promise<boolean> {
  if (mode === 'off') {
    console.log(intentionalSkipNotice(suite));
    return false;
  }
  const probe = await testConnection(conn, 15000);
  if (probe.success) return true;
  const msg = `${suite} skipped: ${conn.host} is unreachable (${probe.error.code}: ${probe.error.message}). Start it with port/couchbase-test/run.sh.`;
  if (mode === 'required') throw new Error(msg);
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
  options: Record<string, unknown> = {},
) {
  const payload: Record<string, unknown> = { statement, ...options };
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
  // COUNT(*) without a WHERE is answered from the collection's document
  // count, not an index, so it can be complete while the primary index still
  // lags and a not_bounded chart query then misses the last rows. A
  // request_plus scan of the primary index waits for it to catch up.
  const [n] = await adminMutate(
    `SELECT RAW COUNT(*) FROM ${ks(collection)} AS d WHERE META(d).id IS NOT MISSING`,
    {},
    { scan_consistency: 'request_plus' },
  );
  if (Number(n) < docs.length) {
    throw new Error(`${collection}: seeded docs not visible`);
  }
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
