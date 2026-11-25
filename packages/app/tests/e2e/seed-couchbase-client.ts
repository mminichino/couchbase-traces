/**
 * Query REST client and upsert helpers for the Couchbase E2E seed.
 */
import { fromShapedRow } from '../../../ingest/src/model/fromShapedRow';

import {
  E2E_CUSTOM_SERVICE_LOGS_TABLE,
  E2E_LOGS_TABLE,
  E2E_TRACES_TABLE,
} from './utils/constants';

const QUERY_URL =
  process.env.COUCHBASE_URL?.replace(/\/$/, '') ??
  `http://127.0.0.1:${process.env.CBT_E2E_CB_QUERY_PORT ?? '28291'}`;
const AUTH = Buffer.from(
  `${process.env.COUCHBASE_USERNAME ?? 'Administrator'}:${process.env.COUCHBASE_PASSWORD ?? 'cbt-test-admin'}`,
).toString('base64');

export async function runStatement(
  statement: string,
  parameters?: Record<string, unknown>,
) {
  const args: Record<string, unknown> = { statement };
  if (parameters) {
    for (const [k, v] of Object.entries(parameters)) {
      args[`$${k}`] = v;
    }
  }
  const res = await fetch(`${QUERY_URL}/query/service`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${AUTH}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const body = await res.json();
  if (body.status !== 'success') {
    throw new Error(JSON.stringify(body.errors ?? body));
  }
}

export async function upsertDoc(
  collection: string,
  key: string,
  value: Record<string, unknown>,
) {
  await runStatement(
    `UPSERT INTO \`otel\`.\`default\`.\`${collection}\` (KEY, VALUE) VALUES ($key, $value)`,
    { key, value },
  );
}

const UPSERT_BATCH = 250;

/** Multi-row UPSERT: the K8s gauges alone are ~42k documents. */
export async function upsertDocs(
  collection: string,
  docs: { key: string; value: Record<string, unknown> }[],
) {
  for (let i = 0; i < docs.length; i += UPSERT_BATCH) {
    const batch = docs.slice(i, i + UPSERT_BATCH);
    const params: Record<string, unknown> = {};
    const values = batch.map((doc, j) => {
      params[`k${j}`] = doc.key;
      params[`v${j}`] = doc.value;
      return `($k${j}, $v${j})`;
    });
    await runStatement(
      `UPSERT INTO \`otel\`.\`default\`.\`${collection}\` (KEY, VALUE) VALUES ${values.join(', ')}`,
      params,
    );
  }
}

export type ShapedCollection = 'otel_logs' | 'otel_traces' | 'otel_sessions';
const SHAPED_TABLE: Record<ShapedCollection, string> = {
  otel_logs: E2E_LOGS_TABLE,
  otel_traces: E2E_TRACES_TABLE,
  otel_sessions: 'e2e_otel_sessions',
};

/** Rows shaped like upstream's VALUES columns, keyed and materialized as ingest does. */
export async function upsertShaped(
  collection: ShapedCollection,
  rows: Record<string, unknown>[],
  label: string,
) {
  const docs = rows.map(row =>
    fromShapedRow(SHAPED_TABLE[collection], row, { collection }),
  );
  await upsertDocs(collection, docs);
  console.log(`  ✓ Upserted ${docs.length} ${label}`);
}

export async function upsertMetrics(
  collection: string,
  rows: Record<string, unknown>[],
  label: string,
) {
  await upsertDocs(
    collection,
    rows.map((value, i) => ({
      key: `${label.replace(/\s+/g, '-')}::${String(value.MetricName)}::${i}`,
      value,
    })),
  );
  console.log(`  ✓ Upserted ${rows.length} ${label}`);
}

/** Creates a collection and its primary index, retrying while the query service catches up. */
export async function ensureCollection(collection: string): Promise<void> {
  await runStatement(
    `CREATE COLLECTION \`otel\`.\`default\`.\`${collection}\` IF NOT EXISTS`,
  );
  // Query engine can lag the catalog after CREATE COLLECTION.
  let lastError: unknown;
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      await runStatement(
        `CREATE PRIMARY INDEX IF NOT EXISTS ON \`otel\`.\`default\`.\`${collection}\``,
      );
      return;
    } catch (err) {
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? `${collection} primary index failed`));
}

/** Upstream's `e2e_custom_service_name` rows, keyed as logs. */
export async function upsertCustomServiceRows(
  rows: Record<string, unknown>[],
): Promise<void> {
  await upsertDocs(
    'e2e_custom_service_name',
    rows.map(row =>
      fromShapedRow(E2E_CUSTOM_SERVICE_LOGS_TABLE, row, {
        collection: 'e2e_custom_service_name',
      }),
    ),
  );
}

/**
 * The time and name indexes ingest setup puts on `otel_metrics_*`
 * (`metricIndexes` in packages/ingest/src/model/collections.ts). The E2E
 * metric collections are created here with a primary index only, and the
 * Kubernetes page's ~42k gauge points are too many to scan per query.
 */
const METRIC_INDEX_KEYS: readonly [string, string][] = [
  ['ts', '`TimeUnix` DESC'],
  ['name_ts', '`MetricName`, `TimeUnix` DESC'],
  ['svc_name_ts', '`ServiceName`, `MetricName`, `TimeUnix` DESC'],
];

export async function ensureMetricIndexes(collection: string): Promise<void> {
  for (const [suffix, keys] of METRIC_INDEX_KEYS) {
    await runStatement(
      `CREATE INDEX \`ix_${collection}_${suffix}\` IF NOT EXISTS ON \`otel\`.\`default\`.\`${collection}\`(${keys})`,
    );
  }
}

/**
 * Upstream truncates every E2E table before seeding. Seed keys carry the run's
 * time window, so without this a reused stack (`--keep-running`,
 * `make dev-e2e`) accumulates one copy of each row per run. Ingest-owned
 * collections have no primary index; their `Timestamp DESC` index serves the
 * predicate. Collections the seed creates have a primary index.
 */
export async function truncateSeededCollections(
  primaryIndexed: string[],
): Promise<void> {
  for (const collection of ['otel_logs', 'otel_traces', 'otel_sessions']) {
    await runStatement(
      `DELETE FROM \`otel\`.\`default\`.\`${collection}\` WHERE \`Timestamp\` IS NOT MISSING`,
    );
  }
  for (const collection of primaryIndexed) {
    await runStatement(`DELETE FROM \`otel\`.\`default\`.\`${collection}\``);
  }
  console.log('  ✓ Cleared previously seeded documents');
}
