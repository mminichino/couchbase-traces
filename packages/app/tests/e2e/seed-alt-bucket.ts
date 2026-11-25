/**
 * The second "database" upstream's `seed-clickhouse.ts` creates for
 * `metric-table-autofill.spec.ts`: `e2e_metrics_alt` with empty gauge and sum
 * tables. On Couchbase a database is a bucket, so this creates a 100 MiB Magma
 * bucket (the 8.0 minimum, 128 vBuckets by default) next to `otel` (1024 MiB)
 * and `cbt_meta` (256 MiB) inside the E2E node's 2048 MiB data quota (Q57).
 * Like upstream's tables, the collections stay empty.
 */
import {
  E2E_ALT_METRICS_DATABASE,
  E2E_ALT_METRICS_GAUGE_TABLE,
  E2E_ALT_METRICS_SUM_TABLE,
} from './utils/constants';
import { runStatement } from './seed-couchbase-client';

const MGMT_URL = `http://127.0.0.1:${process.env.CBT_E2E_CB_MGMT_PORT ?? '28091'}`;
const AUTH = Buffer.from(
  `${process.env.COUCHBASE_USERNAME ?? 'Administrator'}:${process.env.COUCHBASE_PASSWORD ?? 'cbt-test-admin'}`,
).toString('base64');
const ALT_BUCKET_RAM_MB = 100;
// Source forms default an empty scope to `default`, as on the `otel` bucket.
const ALT_SCOPE = 'default';

async function createBucketIfMissing(): Promise<void> {
  const existing = await fetch(
    `${MGMT_URL}/pools/default/buckets/${E2E_ALT_METRICS_DATABASE}`,
    { headers: { authorization: `Basic ${AUTH}` } },
  );
  if (existing.ok) return;
  const res = await fetch(`${MGMT_URL}/pools/default/buckets`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${AUTH}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      name: E2E_ALT_METRICS_DATABASE,
      bucketType: 'couchbase',
      storageBackend: 'magma',
      ramQuota: String(ALT_BUCKET_RAM_MB),
      replicaNumber: '0',
    }),
  });
  if (res.status !== 202 && !res.ok) {
    throw new Error(
      `Creating bucket ${E2E_ALT_METRICS_DATABASE} failed: ${res.status} ${await res.text()}`,
    );
  }
}

/** Retries while a new bucket or collection is not yet visible to the query service. */
async function retry(statement: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 60; attempt++) {
    try {
      await runStatement(statement);
      return;
    } catch (err) {
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? `${statement} failed`));
}

export async function ensureAltMetricsBucket(): Promise<void> {
  await createBucketIfMissing();
  const bucket = `\`${E2E_ALT_METRICS_DATABASE}\``;
  await retry(`CREATE SCOPE ${bucket}.\`${ALT_SCOPE}\` IF NOT EXISTS`);
  for (const collection of [
    E2E_ALT_METRICS_GAUGE_TABLE,
    E2E_ALT_METRICS_SUM_TABLE,
  ]) {
    const keyspace = `${bucket}.\`${ALT_SCOPE}\`.\`${collection}\``;
    await retry(`CREATE COLLECTION ${keyspace} IF NOT EXISTS`);
    await retry(`CREATE PRIMARY INDEX IF NOT EXISTS ON ${keyspace}`);
  }
  console.log(
    `  ✓ ${E2E_ALT_METRICS_DATABASE} ready (${ALT_BUCKET_RAM_MB} MiB, empty metric collections)`,
  );
}
