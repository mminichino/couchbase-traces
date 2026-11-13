/**
 * Seeds Couchbase collections for E2E when CBT_E2E_STORE=couchbase.
 */
import { fromClickHouseRow } from '../../../ingest/src/model/fromClickHouseRow';

import {
  E2E_CUSTOM_SERVICE_LOGS_TABLE,
  E2E_EXP_HISTOGRAM_METRIC_NAME,
  E2E_LOGS_TABLE,
  E2E_METRICS_EXP_HISTOGRAM_TABLE,
  E2E_METRICS_GAUGE_TABLE,
  E2E_TRACES_TABLE,
} from './utils/constants';
import { parseValuesTuples } from './parseValuesTuples';
import { getE2eSeedWindow } from './seed-clickhouse';

const QUERY_URL =
  process.env.COUCHBASE_URL?.replace(/\/$/, '') ??
  `http://127.0.0.1:${process.env.CBT_E2E_CB_QUERY_PORT ?? '28291'}`;
const AUTH = Buffer.from(
  `${process.env.COUCHBASE_USERNAME ?? 'Administrator'}:${process.env.COUCHBASE_PASSWORD ?? 'cbt-test-admin'}`,
).toString('base64');

async function runStatement(
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

async function upsertDoc(
  collection: string,
  key: string,
  value: Record<string, unknown>,
) {
  await runStatement(
    `UPSERT INTO \`otel\`.\`default\`.\`${collection}\` (KEY, VALUE) VALUES ($key, $value)`,
    { key, value },
  );
}

export async function ensureE2eCustomServiceCollection(): Promise<void> {
  await runStatement(
    'CREATE COLLECTION `otel`.`default`.`e2e_custom_service_name` IF NOT EXISTS',
  );
  // Query engine can lag the catalog after CREATE COLLECTION.
  let lastError: unknown;
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      await runStatement(
        'CREATE PRIMARY INDEX IF NOT EXISTS ON `otel`.`default`.`e2e_custom_service_name`',
      );
      return;
    } catch (err) {
      lastError = err;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(String(lastError ?? 'primary index create failed'));
}

export async function seedCouchbase(): Promise<void> {
  if (process.env.CBT_E2E_STORE !== 'couchbase') {
    console.warn('seed-couchbase: skipped (CBT_E2E_STORE is not couchbase)');
    return;
  }

  console.log('Seeding Couchbase E2E documents...');
  await ensureE2eCustomServiceCollection();

  const { startMs, endMs, numDataPoints } = getE2eSeedWindow();

  const logRows = parseValuesTuples(
    E2E_LOGS_TABLE,
    numDataPoints,
    startMs,
    endMs,
  );
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

  async function ensureMetricCollection(collection: string): Promise<void> {
    await runStatement(
      `CREATE COLLECTION \`otel\`.\`default\`.\`${collection}\` IF NOT EXISTS`,
    );
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

  await ensureMetricCollection(E2E_METRICS_GAUGE_TABLE);
  await ensureMetricCollection(E2E_METRICS_EXP_HISTOGRAM_TABLE);

  const { startMs: metricStart } = getE2eSeedWindow();
  const gaugeNames = [
    'e2e.gauge.visible',
    'e2e.gauge.extra_a',
    'e2e.gauge.extra_b',
  ];
  for (let i = 0; i < 30; i++) {
    const t = new Date(metricStart + i * 60_000).toISOString();
    const name = gaugeNames[i % gaugeNames.length];
    await upsertDoc(E2E_METRICS_GAUGE_TABLE, `gauge::${name}::${i}`, {
      ResourceAttributes: { 'service.name': 'api' },
      ScopeAttributes: {},
      Attributes: { host: `h${i % 4}` },
      ServiceName: 'api',
      MetricName: name,
      MetricDescription: 'E2E gauge',
      MetricUnit: '1',
      StartTimeUnix: t,
      TimeUnix: t,
      Value: (i % 10) + 0.5,
      Flags: 0,
    });
  }
  console.log(`  ✓ Upserted 30 gauge points across ${gaugeNames.length} names`);

  for (let i = 0; i < 40; i++) {
    const t = new Date(metricStart + i * 60_000).toISOString();
    const counts = [1 + (i % 3), 2 + (i % 5), 4 + (i % 7)];
    await upsertDoc(E2E_METRICS_EXP_HISTOGRAM_TABLE, `exp::${i}`, {
      ResourceAttributes: { 'service.name': 'api' },
      ScopeAttributes: {},
      Attributes: { host: `h${i % 4}` },
      ServiceName: 'api',
      MetricName: E2E_EXP_HISTOGRAM_METRIC_NAME,
      MetricDescription: 'E2E request duration',
      MetricUnit: 'ms',
      StartTimeUnix: t,
      TimeUnix: t,
      Count: counts.reduce((a, b) => a + b, 0),
      Sum: 0,
      Scale: 0,
      ZeroCount: 0,
      PositiveOffset: 0,
      PositiveBucketCounts: counts,
      NegativeOffset: 0,
      NegativeBucketCounts: [],
      AggregationTemporality: 1,
      Flags: 0,
    });
  }
  console.log(
    `  ✓ Upserted 40 ${E2E_EXP_HISTOGRAM_METRIC_NAME} exponential histogram points`,
  );
}
