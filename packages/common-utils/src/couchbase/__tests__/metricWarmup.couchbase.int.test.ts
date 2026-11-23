/**
 * D23: one-interval warm-up window on a live cluster. Upstream
 * renderChartConfig reads one granularity interval either side of a
 * timeseries Sum / Histogram / Exponential Histogram range so the first
 * visible bucket has a predecessor to subtract, then drops the padded
 * buckets. The exponential-histogram cases port upstream
 * api/src/clickhouse/__tests__/renderChartConfig.int.test.ts (same inputs,
 * same values, same rows); upstream has no Sum or explicit Histogram
 * warm-up case, so those two follow the same rule on this port's fixtures.
 * Requires port/couchbase-test (CBT_TEST_COUCHBASE_*).
 */
import { clusterCache } from '@/couchbase/node';
import { toIso30 } from '@/couchbase/time';
import type { MetricTable } from '@/types';
import { DisplayType, MetricsDataType } from '@/types';

import { expMetric } from './expHistogramFixtures';
import {
  ensureCollection,
  liveConnection,
  probeLive,
  runChart,
  seed,
} from './liveCluster';

const conn = liveConnection('d23-metric-warmup');
const EXP = 'd23_metrics_exponential_histogram';
const HIST = 'd23_metrics_histogram';
const SUM = 'd23_metrics_sum';
const metricTables = {
  [MetricsDataType.ExponentialHistogram.toLowerCase()]: EXP,
  [MetricsDataType.Histogram.toLowerCase()]: HIST,
  [MetricsDataType.Sum.toLowerCase()]: SUM,
} as MetricTable;

const NOW = new Date('2022-01-05T00:00:00.000Z').getTime();
const plus = (seconds: number) => new Date(NOW + seconds * 1000);
const range = (seconds: number): [Date, Date] => [plus(0), plus(seconds)];

type Row = Record<string, unknown>;

const otel = (MetricName: string, seconds: number, start = -600) => ({
  MetricName,
  ServiceName: 'svc',
  ResourceAttributes: {},
  ScopeAttributes: {},
  Attributes: {},
  AggregationTemporality: 2,
  StartTimeUnix: toIso30(plus(start)),
  TimeUnix: toIso30(plus(seconds)),
});

let live = false;

beforeAll(async () => {
  live = await probeLive(conn, 'D23 metric warm-up');
  if (!live) return;
  await Promise.all([EXP, HIST, SUM].map(ensureCollection));
  await seed(EXP, [
    ...expMetric(plus, 'count.cumulative.warmup', [
      { at: -60, start: -120, values: [2, 4] },
      { at: 0, start: -120, values: [2, 4, 8] },
      { at: 60, start: -120, values: [2, 4, 8, 16, 32] },
    ]),
    ...expMetric(plus, 'cumulative.warmup', [
      { at: -60, start: -120, values: [2, 2] },
      { at: 0, start: -120, values: [2, 2, 4, 4] },
    ]),
    ...expMetric(plus, 'cumulative.stale.baseline', [
      { at: -120, start: -180, values: [2, 2] },
      { at: 60, start: -180, values: [2, 2, 4, 4] },
    ]),
  ]);
  await seed(HIST, [
    // [2, 0] at -1m is the baseline for 0m; 3m lies past the range.
    ...[
      { at: -60, counts: [2, 0] },
      { at: 0, counts: [2, 2] },
      { at: 60, counts: [2, 4] },
      { at: 180, counts: [102, 104] },
    ].map(p => ({
      ...otel('hist.warmup', p.at),
      ExplicitBounds: [10],
      BucketCounts: p.counts,
      Count: p.counts.reduce((a, b) => a + b, 0),
    })),
  ]);
  await seed(SUM, [
    ...[
      [-60, 10],
      [0, 15],
      [60, 22],
      [180, 100],
    ].map(([at, Value]) => ({
      ...otel('sum.warmup', at),
      IsMonotonic: true,
      Value,
    })),
    // The only predecessor sits two intervals back: never read.
    ...[
      [-120, 10],
      [0, 15],
    ].map(([at, Value]) => ({
      ...otel('sum.stale.baseline', at),
      IsMonotonic: true,
      Value,
    })),
  ]);
}, 120_000);

afterAll(async () => {
  await clusterCache.closeAll();
});

const chart = async (
  metricType: MetricsDataType,
  metricName: string,
  select: Record<string, unknown>,
  seconds: number,
): Promise<{ at: number; Value: number }[]> =>
  (
    (await runChart(conn, {
      displayType: DisplayType.Line,
      connection: 'c',
      from: { databaseName: 'test', scopeName: 'app', tableName: '' },
      metricTables,
      select: [
        {
          metricName,
          metricType,
          valueExpression: 'Value',
          aggCondition: '',
          ...select,
        },
      ],
      where: '',
      timestampValueExpression: 'TimeUnix',
      dateRange: range(seconds),
      granularity: '1 minute',
    })) as Row[]
  )
    .map(r => ({
      at: (new Date(String(r.__hdx_time_bucket)).getTime() - NOW) / 1000,
      Value: Number(r.Value),
    }))
    .sort((a, b) => a.at - b.at);

const EXP_TYPE = MetricsDataType.ExponentialHistogram;
// Upstream defaults a Sum select's alias to Value; this port names the
// column after the aggregate (D25), so the sum cases set it.
const SUM_SELECT = { aggFn: 'sum', alias: 'Value' };

describe('D23 metric warm-up window on a live cluster', () => {
  it('subtracts cumulative counts using a warm-up point outside the requested range', async () => {
    if (!live) return;
    // Upstream queryCount: range [now, now + 3m].
    expect(
      await chart(EXP_TYPE, 'count.cumulative.warmup', { aggFn: 'count' }, 180),
    ).toEqual([
      { at: 0, Value: 1 },
      { at: 60, Value: 2 },
    ]);
  });

  it('uses a cumulative warm-up point outside the requested range as the subtraction baseline', async () => {
    if (!live) return;
    // Upstream queryQuantile: range [now, now + 2m]. The -1m point is only
    // the baseline; the first visible bucket holds just the two new 4s.
    const rows = await chart(
      EXP_TYPE,
      'cumulative.warmup',
      { aggFn: 'quantile', level: 0.5 },
      120,
    );
    expect(rows.map(r => r.at)).toEqual([0]);
    expect(rows[0].Value).toBeCloseTo(Math.sqrt(8));
  });

  it('emits no value when the cumulative baseline precedes the one-interval warm-up window', async () => {
    if (!live) return;
    expect(
      await chart(
        EXP_TYPE,
        'cumulative.stale.baseline',
        { aggFn: 'quantile', level: 0.5 },
        120,
      ),
    ).toEqual([]);
  });

  it('counts the first visible explicit-histogram bucket against the warm-up point', async () => {
    if (!live) return;
    // 0m: [2, 2] - [2, 0] = 2; 1m: [2, 4] - [2, 2] = 2; no -1m or 3m row.
    expect(
      await chart(
        MetricsDataType.Histogram,
        'hist.warmup',
        { aggFn: 'count' },
        120,
      ),
    ).toEqual([
      { at: 0, Value: 2 },
      { at: 60, Value: 2 },
    ]);
  });

  it('rates the first visible sum bucket against the warm-up point', async () => {
    if (!live) return;
    // 15 - 10 = 5, then 22 - 15 = 7; the -1m and 3m buckets are dropped.
    expect(
      await chart(MetricsDataType.Sum, 'sum.warmup', SUM_SELECT, 120),
    ).toEqual([
      { at: 0, Value: 5 },
      { at: 60, Value: 7 },
    ]);
  });

  it('reads back exactly one interval for a sum baseline', async () => {
    if (!live) return;
    expect(
      await chart(MetricsDataType.Sum, 'sum.stale.baseline', SUM_SELECT, 120),
    ).toEqual([{ at: 0, Value: 0 }]);
  });
});
