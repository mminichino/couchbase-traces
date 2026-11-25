/**
 * Seeds Couchbase collections for full-stack E2E.
 */
import {
  E2E_CUSTOM_SERVICE_LOGS_TABLE,
  E2E_EXP_HISTOGRAM_METRIC_NAME,
  E2E_INTERESTING_FILTER_KEYS_TABLE,
  E2E_LOGS_TABLE,
  E2E_METADATA_MV_LOGS_TABLE,
  E2E_METRICS_EXP_HISTOGRAM_TABLE,
  E2E_METRICS_GAUGE_TABLE,
  E2E_METRICS_SUM_TABLE,
  E2E_TRACES_TABLE,
} from './utils/constants';
import { parseValuesTuples } from './parseValuesTuples';
import {
  ensureCollection,
  ensureMetricIndexes,
  truncateSeededCollections,
  upsertCustomServiceRows,
  upsertDoc,
  upsertMetrics,
  upsertShaped,
} from './seed-couchbase-client';
import { getE2eSeedWindow } from './seed-data';
import {
  buildOtelSessionLogEvents,
  buildOtelSessionReplayRows,
  buildOtelSessionSpans,
  OTEL_SESSIONS,
} from './seed-otel-sessions';
import {
  buildInterestingFilterKeyDocs,
  buildMetadataMvDocs,
} from './seed-rows-filter-keys';
import { buildK8sEventLogRows, buildK8sLogRows } from './seed-rows-k8s';
import { buildK8sGaugeRows, buildK8sSumRows } from './seed-rows-k8s-metrics';
import {
  buildJsonBodyLogRow,
  buildLegacySessionRows,
  buildLegacySessionSpans,
  buildSpanLinkTraceRows,
} from './seed-rows-sessions';

export async function seedCouchbase(): Promise<void> {
  console.log('Seeding Couchbase E2E documents...');
  const seedCreated = [
    E2E_CUSTOM_SERVICE_LOGS_TABLE,
    E2E_METRICS_GAUGE_TABLE,
    E2E_METRICS_EXP_HISTOGRAM_TABLE,
    // The metric source declares a sum collection; /kubernetes reads it for
    // pod uptime (upstream's schema creates the table).
    E2E_METRICS_SUM_TABLE,
    E2E_INTERESTING_FILTER_KEYS_TABLE,
    E2E_METADATA_MV_LOGS_TABLE,
  ];
  for (const collection of seedCreated) {
    await ensureCollection(collection);
  }
  for (const collection of [
    E2E_METRICS_GAUGE_TABLE,
    E2E_METRICS_EXP_HISTOGRAM_TABLE,
    E2E_METRICS_SUM_TABLE,
  ]) {
    await ensureMetricIndexes(collection);
  }
  await truncateSeededCollections(seedCreated);

  const { startMs, endMs, numDataPoints } = getE2eSeedWindow();

  const logRows = parseValuesTuples(
    E2E_LOGS_TABLE,
    numDataPoints,
    startMs,
    endMs,
  );
  await upsertShaped('otel_logs', logRows, 'log documents');

  const traceRows = parseValuesTuples(
    E2E_TRACES_TABLE,
    numDataPoints,
    startMs,
    endMs,
  );
  await upsertShaped('otel_traces', traceRows, 'trace documents');

  const customRows = parseValuesTuples(
    E2E_CUSTOM_SERVICE_LOGS_TABLE,
    numDataPoints,
    startMs,
    endMs,
  );
  await upsertCustomServiceRows(customRows);
  console.log(`  ✓ Upserted ${customRows.length} custom service log documents`);

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

  // Place rows near "now" so default dashboard windows (e.g. Last 15 minutes)
  // still include them; startMs alone sits an hour back and misses short ranges.
  const { seedRef: interestingRef } = getE2eSeedWindow();
  for (const [table, docs] of [
    [
      E2E_INTERESTING_FILTER_KEYS_TABLE,
      buildInterestingFilterKeyDocs(interestingRef),
    ],
    [E2E_METADATA_MV_LOGS_TABLE, buildMetadataMvDocs(interestingRef)],
  ] as const) {
    for (const { id, doc } of docs) {
      await upsertDoc(table, id, doc);
    }
    console.log(`  ✓ Upserted ${docs.length} ${table} documents`);
  }

  // Upstream seeds the sessions table with legacy-SDK rows and the OTel SDK
  // replay rows; their spans and browser log events go to traces and logs.
  const {
    seedRef,
    startMs: winStart,
    endMs: winEnd,
    numDataPoints: n,
  } = getE2eSeedWindow();
  await upsertShaped(
    'otel_sessions',
    [
      ...buildLegacySessionRows(n, winStart, winEnd),
      ...buildOtelSessionReplayRows(seedRef),
    ],
    `session documents (${Object.keys(OTEL_SESSIONS).length} OTel SDK sessions)`,
  );
  await upsertShaped(
    'otel_traces',
    [
      ...buildLegacySessionSpans(n, winStart, winEnd),
      ...buildOtelSessionSpans(seedRef),
      ...buildSpanLinkTraceRows(seedRef),
    ],
    'session and span-link spans',
  );
  await upsertShaped(
    'otel_logs',
    [
      buildJsonBodyLogRow(seedRef),
      ...buildK8sLogRows(n, winStart, winEnd),
      ...buildK8sEventLogRows(n, winStart, winEnd),
      ...buildOtelSessionLogEvents(seedRef),
    ],
    'JSON-body, K8s, K8s event and OTel browser log documents',
  );
  await upsertMetrics(
    E2E_METRICS_GAUGE_TABLE,
    buildK8sGaugeRows(n, 12, winStart, winEnd),
    'K8s gauge points',
  );
  await upsertMetrics(
    E2E_METRICS_SUM_TABLE,
    buildK8sSumRows(n, winStart, winEnd),
    'K8s sum points',
  );
}
