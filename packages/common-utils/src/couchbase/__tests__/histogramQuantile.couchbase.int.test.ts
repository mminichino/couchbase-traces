/**
 * D21: explicit-bounds histogram quantile on a live cluster. Ports upstream
 * api/src/clickhouse/__tests__/renderChartConfig.int.test.ts "Query Metrics
 * - Histogram" cases (same inputs, same values, same rows): a cumulative
 * series' first point is the zero-delta baseline, and a bucket with no
 * observations has no row. Requires port/couchbase-test (CBT_TEST_COUCHBASE_*).
 */
import { clusterCache } from '@/couchbase/node';
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

const conn = liveConnection('d21-histogram-quantile');
const HIST = 'd21_metrics_histogram';
const metricTables = {
  [MetricsDataType.Histogram.toLowerCase()]: HIST,
} as MetricTable;

const NOW = new Date('2022-01-05T00:00:00.000Z').getTime();
const at = (minutes: number) => toIso30(new Date(NOW + minutes * 60_000));
const range = (minutes: number): [Date, Date] => [
  new Date(NOW),
  new Date(NOW + minutes * 60_000),
];

type Row = Record<string, unknown>;
type Point = {
  minute: number;
  counts: number[];
  bounds: number[];
  temporality?: number;
  route?: string;
};

const point = (MetricName: string, p: Point) => ({
  MetricName,
  ServiceName: 'svc',
  ResourceAttributes: { host: 'test2', ip: '127.0.0.1' },
  ScopeAttributes: {},
  Attributes: p.route ? { route: p.route } : {},
  AggregationTemporality: p.temporality ?? 2,
  ExplicitBounds: p.bounds,
  BucketCounts: p.counts,
  Count: p.counts.reduce((a, b) => a + b, 0),
  StartTimeUnix: at(-10),
  TimeUnix: at(p.minute),
});

let live = false;

beforeAll(async () => {
  live = await probeLive(conn, 'D21 histogram quantile');
  if (!live) return;
  await ensureCollection(HIST);
  const series = (name: string, points: Point[]) =>
    points.map(p => point(name, p));
  await seed(HIST, [
    ...series('two_timestamps_lower_bound', [
      { minute: 0, counts: [0, 0, 0], bounds: [10, 30] },
      { minute: 1, counts: [10, 10, 10], bounds: [10, 30] },
    ]),
    ...series('two_timestamps_lower_bound_inf', [
      { minute: 0, counts: [0, 0, 0], bounds: [1, 30] },
      { minute: 1, counts: [10, 0, 0], bounds: [1, 30] },
    ]),
    ...series('first_visible_baseline', [
      { minute: -1, counts: [2, 0], bounds: [10] },
      { minute: 0, counts: [2, 2], bounds: [10] },
      { minute: 1, counts: [2, 4], bounds: [10] },
      { minute: 3, counts: [102, 104], bounds: [10] },
    ]),
    ...series('grouped_delta', [
      { minute: 0, counts: [10, 0, 0], bounds: [10, 30], route: '/ten' },
      { minute: 1, counts: [0, 10, 0], bounds: [10, 30], route: '/ten' },
      { minute: 0, counts: [6, 0, 0], bounds: [100, 300], route: '/hundred' },
      { minute: 2, counts: [0, 6, 0], bounds: [100, 300], route: '/hundred' },
    ]).map(p => ({ ...p, AggregationTemporality: 1 })),
    ...series('grouped_reset', [
      { minute: 0, counts: [2, 0, 0], bounds: [10, 30], route: '/reset' },
      { minute: 1, counts: [6, 0, 0], bounds: [10, 30], route: '/reset' },
      { minute: 2, counts: [0, 4, 0], bounds: [10, 30], route: '/reset' },
      { minute: 0, counts: [0, 2, 0], bounds: [10, 30], route: '/normal' },
      { minute: 1, counts: [4, 2, 0], bounds: [10, 30], route: '/normal' },
      { minute: 3, counts: [4, 6, 0], bounds: [10, 30], route: '/normal' },
    ]),
    // A series whose bucket layout changes: upstream takes the new point's
    // counts as they are instead of subtracting a different layout.
    ...series('bounds_change', [
      { minute: 0, counts: [5, 5], bounds: [10] },
      { minute: 1, counts: [0, 10, 0], bounds: [10, 30] },
    ]),
  ]);
}, 120_000);

afterAll(async () => {
  await clusterCache.closeAll();
});

const select = (metricName: string, extra: Record<string, unknown>) => ({
  metricName,
  metricType: MetricsDataType.Histogram,
  valueExpression: 'Value',
  aggCondition: '',
  ...extra,
});

const timeseries = (metricName: string, level: number) =>
  runChart(conn, {
    displayType: DisplayType.Line,
    connection: 'c',
    from: { databaseName: 'test', scopeName: 'app', tableName: '' },
    metricTables,
    select: [select(metricName, { aggFn: 'quantile', level })],
    where: '',
    timestampValueExpression: 'TimeUnix',
    dateRange: range(2),
    granularity: '1 minute',
  }) as Promise<Row[]>;

const values = (rows: Row[]) =>
  rows.map(r => ({
    bucket: new Date(String(r.__hdx_time_bucket)).getTime(),
    Value: Number(r.Value),
  }));

const nonTimeseries = (
  metricName: string,
  extra: Record<string, unknown>,
  chart: Record<string, unknown> = {},
) =>
  runChart(conn, {
    displayType: DisplayType.Table,
    connection: 'c',
    from: { databaseName: 'test', scopeName: 'app', tableName: '' },
    metricTables,
    select: [select(metricName, extra)],
    where: '',
    timestampValueExpression: 'TimeUnix',
    dateRange: range(4),
    groupBy: "Attributes['route']",
    ...chart,
  }) as Promise<Row[]>;

const byGroup = (rows: Row[]) =>
  Object.fromEntries(
    rows.map(r => [(r.group as string[]).join(','), Number(r.Value)]),
  );

describe('D21 histogram quantile on a live cluster', () => {
  it.each([
    ['p50', 0.5, 20],
    ['p90', 0.9, 30],
    ['p25', 0.25, 7.5],
  ])(
    'two_timestamps_bounded histogram (%s)',
    async (_label, level, expected) => {
      if (!live) return;
      // The minute-0 baseline contributes nothing, so it has no row.
      expect(
        values(await timeseries('two_timestamps_lower_bound', level)),
      ).toEqual([{ bucket: NOW + 60_000, Value: expected }]);
    },
  );

  it('two_timestamps_lower_bound_inf histogram (p50)', async () => {
    if (!live) return;
    expect(
      values(await timeseries('two_timestamps_lower_bound_inf', 0.5)),
    ).toEqual([{ bucket: NOW + 60_000, Value: 0.5 }]);
  });

  it('uses the first visible cumulative histogram point as the baseline', async () => {
    if (!live) return;
    // Only [0m, 2m] is scanned: 0m is the baseline and 1m contributes
    // [2, 4] - [2, 2] = [0, 2], whose p50 is the overflow bucket's finite
    // lower boundary 10. The -1m and 3m points are outside the range.
    const number = (extra: Record<string, unknown>) =>
      nonTimeseries('first_visible_baseline', extra, {
        displayType: DisplayType.Number,
        groupBy: undefined,
        dateRange: range(2),
      });
    expect(
      (await number({ aggFn: 'count' })).map(r => Number(r.Value)),
    ).toEqual([2]);
    expect(
      (await number({ aggFn: 'quantile', level: 0.5 })).map(r =>
        Number(r.Value),
      ),
    ).toEqual([10]);
  });

  it('aggregates histogram count and quantile across every timestamp in each non-timeseries group', async () => {
    if (!live) return;
    const count = await nonTimeseries('grouped_delta', { aggFn: 'count' });
    expect(byGroup(count)).toEqual({ '/ten': 20, '/hundred': 12 });
    const p50 = await nonTimeseries('grouped_delta', {
      aggFn: 'quantile',
      level: 0.5,
    });
    expect(p50).toHaveLength(2);
    expect(byGroup(p50)).toEqual({ '/ten': 10, '/hundred': 100 });
    expect(p50.every(r => !('__hdx_time_bucket' in r))).toBe(true);
  });

  it('aggregates reset-adjusted histogram count and quantile across each non-timeseries group', async () => {
    if (!live) return;
    // /reset: 0 for its first point, [6,0,0] - [2,0,0] = [4,0,0], then the
    // decrease is a reset and [0,4,0] counts as is. /normal reaches the same
    // [4,4,0] by subtraction. p50 of [4,4,0] is the shared boundary 10.
    const count = await nonTimeseries('grouped_reset', { aggFn: 'count' });
    expect(byGroup(count)).toEqual({ '/reset': 8, '/normal': 8 });
    const p50 = await nonTimeseries('grouped_reset', {
      aggFn: 'quantile',
      level: 0.5,
    });
    expect(byGroup(p50)).toEqual({ '/reset': 10, '/normal': 10 });
  });

  it('takes the current counts when a series changes its bucket bounds', async () => {
    if (!live) return;
    // Minute 0 is the baseline; minute 1 has a new layout, so its counts
    // [0, 10, 0] over [10, 30] are the delta: p50 interpolates to 20.
    expect(values(await timeseries('bounds_change', 0.5))).toEqual([
      { bucket: NOW + 60_000, Value: 20 },
    ]);
  });
});
