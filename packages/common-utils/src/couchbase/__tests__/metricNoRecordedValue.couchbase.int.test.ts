/**
 * D27 on a live cluster. Ports upstream
 * common-utils/src/__tests__/metricNoRecordedValue.int.test.ts (same
 * fixtures and expectations): a point with OTLP FLAG_NO_RECORDED_VALUE
 * (Flags bit 0) is left out of every metric source. Requires
 * port/couchbase-test (CBT_TEST_COUCHBASE_*).
 */
import { clusterCache } from '@/couchbase/node';
import { declaredColumns } from '@/couchbase/otelSchema';
import { toIso30 } from '@/couchbase/time';
import type { MetricTable } from '@/types';
import { DisplayType, MetricsDataType } from '@/types';

import {
  ensureCollection,
  liveConnection,
  probeLive,
  runChart,
  seed,
} from './liveCluster';

const conn = liveConnection('d27-no-recorded-value');
const GAUGE = 'd27_metrics_gauge';
const SUM = 'd27_metrics_sum';
const HIST = 'd27_metrics_histogram';
const EXP = 'd27_metrics_exponential_histogram';
const metricTables = {
  gauge: GAUGE,
  sum: SUM,
  histogram: HIST,
  summary: 'unused',
  'exponential histogram': EXP,
} as MetricTable;

const metadata = {
  getColumns: async ({ tableName }: { tableName: string }) =>
    declaredColumns(tableName.replace(/^d27_/, 'otel_')) ?? [],
};

const NO_RECORDED_VALUE = 1;
const minuteTs = (minute: number) =>
  toIso30(new Date(Date.UTC(2025, 3, 15, 10, minute)));
// Bucket aliases are MILLIS_TO_UTC strings, as upstream's bucket().
const bucket = (minute: number) => `2025-04-15T10:0${minute}:00Z`;

const commonFields = (
  metricName: string,
  minute: number,
  service: string,
  flags = 0,
) => ({
  ResourceAttributes: { 'service.name': service },
  ScopeAttributes: {},
  ServiceName: service,
  MetricName: metricName,
  Attributes: {},
  StartTimeUnix: minuteTs(0),
  TimeUnix: minuteTs(minute),
  Flags: flags,
});

type Row = Record<string, unknown>;

const runConfig = async (
  metricType: MetricsDataType,
  metricName: string,
  select: { aggFn: string; level?: number },
) => {
  const rows = (await runChart(
    conn,
    {
      displayType: DisplayType.Line,
      connection: 'c',
      metricTables,
      from: { databaseName: 'test', scopeName: 'app', tableName: '' },
      select: [
        {
          ...select,
          aggCondition: '',
          aggConditionLanguage: 'sql',
          valueExpression: 'Value',
          alias: 'Value',
          metricName,
          metricType,
        },
      ],
      where: '',
      whereLanguage: 'sql',
      timestampValueExpression: 'TimeUnix',
      dateRange: [new Date('2025-04-14'), new Date('2025-04-16')],
      granularity: '1 minute',
    },
    metadata,
  )) as Row[];
  return new Map(
    rows.map(row => [String(row.__hdx_time_bucket), Number(row.Value)]),
  );
};

let live = false;

beforeAll(async () => {
  live = await probeLive(conn, 'D27 metric points with no recorded value');
  if (!live) return;
  await Promise.all([GAUGE, SUM, HIST, EXP].map(ensureCollection));

  // Two series report 10 every minute; svc-b goes away after minute 4 and
  // leaves a marker at minute 5.
  const gaugeRow = (
    minute: number,
    service: string,
    value = 10,
    flags = 0,
  ) => ({
    ...commonFields('gauge.cpu', minute, service, flags),
    Value: value,
  });
  await seed(GAUGE, [
    ...[0, 1, 2, 3, 4, 5].map(m => gaugeRow(m, 'svc-a')),
    ...[0, 1, 2, 3, 4].map(m => gaugeRow(m, 'svc-b')),
    gaugeRow(5, 'svc-b', 0, NO_RECORDED_VALUE),
  ]);

  const sumRow =
    (metricName: string) =>
    (minute: number, value: number, flags = 0) => ({
      ...commonFields(metricName, minute, 'svc-a', flags),
      Value: value,
      AggregationTemporality: 2,
      IsMonotonic: true,
    });
  // A cumulative counter that goes up by 10 a minute. One scrape fails at
  // minute 3, then the same series comes back.
  const requests = sumRow('sum.requests');
  // A counter that restarts behind a marker, and the same restart without one.
  const restart = sumRow('sum.restart');
  const restartControl = sumRow('sum.restart.control');
  await seed(SUM, [
    requests(0, 100),
    requests(1, 110),
    requests(2, 120),
    requests(3, 0, NO_RECORDED_VALUE),
    requests(4, 130),
    restart(0, 100),
    restart(1, 120),
    restart(2, 0, NO_RECORDED_VALUE),
    restart(3, 5),
    restartControl(0, 100),
    restartControl(1, 120),
    restartControl(3, 5),
  ]);

  // Cumulative histogram: 10 observations in (0, 10] by minute 1, a marker
  // at minute 2, then 5 new observations in (10, 30] by minute 3.
  const histRow = (minute: number, bucketCounts: number[], flags = 0) => ({
    ...commonFields('hist.latency', minute, 'svc-a', flags),
    Count: bucketCounts.reduce((a, b) => a + b, 0),
    Sum: 0,
    BucketCounts: bucketCounts,
    ExplicitBounds: [10, 30],
    Min: 0,
    Max: 0,
    AggregationTemporality: 2,
  });
  await seed(HIST, [
    histRow(0, [0, 0, 0]),
    histRow(1, [10, 0, 0]),
    histRow(2, [0, 0, 0], NO_RECORDED_VALUE),
    histRow(3, [10, 5, 0]),
  ]);

  // Cumulative native histogram at scale 3, where bucket 8 is (2, 2.18] and
  // bucket 16 is (4, 4.36]: 10 observations in bucket 8 by minute 1, a
  // marker at minute 2, then 5 new observations in bucket 16 by minute 3.
  // The receiver writes a stale point with scale 0 and no buckets.
  const expHistRow = (minute: number, buckets: number[], flags = 0) => ({
    ...commonFields('exphist.latency', minute, 'svc-a', flags),
    Count: buckets.reduce((a, b) => a + b, 0),
    Sum: 0,
    Scale: flags ? 0 : 3,
    ZeroCount: 0,
    PositiveOffset: flags ? 0 : 8,
    PositiveBucketCounts: buckets,
    NegativeOffset: 0,
    NegativeBucketCounts: [],
    Min: 0,
    Max: 0,
    AggregationTemporality: 2,
  });
  await seed(EXP, [
    expHistRow(0, []),
    expHistRow(1, [10]),
    expHistRow(2, [], NO_RECORDED_VALUE),
    expHistRow(3, [10, 0, 0, 0, 0, 0, 0, 0, 5]),
  ]);
}, 120_000);

afterAll(async () => {
  await clusterCache.closeAll();
});

describe('D27 metric points with no recorded value on a live cluster', () => {
  it.each([
    ['min', 10],
    ['avg', 10],
    ['count', 1],
  ])('leaves a gauge marker out of %s', async (aggFn, expected) => {
    if (!live) return;
    const values = await runConfig(MetricsDataType.Gauge, 'gauge.cpu', {
      aggFn,
    });
    expect(values.get(bucket(5))).toBe(expected);
  });

  it('keeps the gauge minute before the marker unchanged', async () => {
    if (!live) return;
    const counts = await runConfig(MetricsDataType.Gauge, 'gauge.cpu', {
      aggFn: 'count',
    });
    expect(counts.get(bucket(4))).toBe(2);
  });

  it('does not count a counter from zero after a marker', async () => {
    if (!live) return;
    const values = await runConfig(MetricsDataType.Sum, 'sum.requests', {
      aggFn: 'increase',
    });
    expect(values.get(bucket(4))).toBe(10);
    expect([...values.values()].reduce((a, b) => a + b, 0)).toBe(30);
  });

  // The Sum query clamps a counter decrease to 0, so the restart minute reads
  // 0 with and without the marker.
  it('treats a counter restart behind a marker like any other counter reset', async () => {
    if (!live) return;
    const select = { aggFn: 'increase' };
    expect(await runConfig(MetricsDataType.Sum, 'sum.restart', select)).toEqual(
      await runConfig(MetricsDataType.Sum, 'sum.restart.control', select),
    );
  });

  it('does not count a histogram from zero after a marker', async () => {
    if (!live) return;
    const counts = await runConfig(MetricsDataType.Histogram, 'hist.latency', {
      aggFn: 'count',
    });
    expect(counts.get(bucket(1))).toBe(10);
    expect(counts.get(bucket(3))).toBe(5);
  });

  it('computes histogram quantiles from the observations after a marker only', async () => {
    if (!live) return;
    const p50 = await runConfig(MetricsDataType.Histogram, 'hist.latency', {
      aggFn: 'quantile',
      level: 0.5,
    });
    expect(p50.get(bucket(3))).toBeGreaterThan(10);
    expect(p50.get(bucket(3))).toBeLessThanOrEqual(30);
  });

  it('does not count an exponential histogram from zero after a marker', async () => {
    if (!live) return;
    const counts = await runConfig(
      MetricsDataType.ExponentialHistogram,
      'exphist.latency',
      { aggFn: 'count' },
    );
    expect(counts.get(bucket(1))).toBe(10);
    expect(counts.get(bucket(3))).toBe(5);
  });

  it('computes exponential histogram quantiles at the series scale from the observations after a marker only', async () => {
    if (!live) return;
    const p50 = await runConfig(
      MetricsDataType.ExponentialHistogram,
      'exphist.latency',
      { aggFn: 'quantile', level: 0.5 },
    );
    expect(p50.get(bucket(3))).toBeGreaterThan(4);
    expect(p50.get(bucket(3))).toBeLessThanOrEqual(2 ** (17 / 8));
  });
});
