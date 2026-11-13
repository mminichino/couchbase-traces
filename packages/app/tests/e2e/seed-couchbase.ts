/**
 * Seeds Couchbase collections for E2E when CBT_E2E_STORE=couchbase.
 */
import { fromClickHouseRow } from '../../../ingest/src/model/fromClickHouseRow';

import { parseValuesTuples } from './parseValuesTuples';
import { getE2eSeedWindow } from './seed-clickhouse';
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

async function runStatement(statement: string, parameters?: Record<string, unknown>) {
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

async function upsertDoc(collection: string, key: string, value: Record<string, unknown>) {
  await runStatement(
    `UPSERT INTO \`otel\`.\`default\`.\`${collection}\` (KEY, VALUE) VALUES ($key, $value)`,
    { key, value },
  );
}

export async function ensureE2eCustomServiceCollection(): Promise<void> {
  await runStatement(
    'CREATE COLLECTION `otel`.`default`.`e2e_custom_service_name` IF NOT EXISTS',
  );
  await runStatement(
    'CREATE PRIMARY INDEX IF NOT EXISTS ON `otel`.`default`.`e2e_custom_service_name`',
  );
}

export async function seedCouchbase(): Promise<void> {
  if (process.env.CBT_E2E_STORE !== 'couchbase') {
    console.warn('seed-couchbase: skipped (CBT_E2E_STORE is not couchbase)');
    return;
  }

  console.log('Seeding Couchbase E2E documents...');
  await ensureE2eCustomServiceCollection();

  const { startMs, endMs, numDataPoints } = getE2eSeedWindow();

  const logRows = parseValuesTuples(E2E_LOGS_TABLE, numDataPoints, startMs, endMs);
  for (const row of logRows) {
    const doc = fromClickHouseRow(E2E_LOGS_TABLE, row, {
      collection: 'otel_logs',
    });
    await upsertDoc(doc.collection, doc.key, doc.value);
  }
  console.log(`  ✓ Upserted ${logRows.length} log documents`);

  const traceRows = parseValuesTuples(
    E2E_TRACES_TABLE,
    numDataPoints,
    startMs,
    endMs,
  );
  for (const row of traceRows) {
    const doc = fromClickHouseRow(E2E_TRACES_TABLE, row, {
      collection: 'otel_traces',
    });
    await upsertDoc(doc.collection, doc.key, doc.value);
  }
  console.log(`  ✓ Upserted ${traceRows.length} trace documents`);

  const customRows = parseValuesTuples(
    E2E_CUSTOM_SERVICE_LOGS_TABLE,
    numDataPoints,
    startMs,
    endMs,
  );
  for (const row of customRows) {
    const doc = fromClickHouseRow(E2E_CUSTOM_SERVICE_LOGS_TABLE, row, {
      collection: 'e2e_custom_service_name',
    });
    await upsertDoc(doc.collection, doc.key, doc.value);
  }
  console.log(`  ✓ Upserted ${customRows.length} custom service log documents`);
}
