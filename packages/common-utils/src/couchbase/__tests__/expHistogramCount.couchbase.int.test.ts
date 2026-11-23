/**
 * D22: exponential-histogram count on a live cluster. Ports upstream
 * api/src/clickhouse/__tests__/renderChartConfig.int.test.ts "Query Metrics
 * - Exponential Histogram" count cases (same inputs, same values, same
 * rows). Each series' cumulative deltas must come from its own previous
 * point. Requires port/couchbase-test (CBT_TEST_COUCHBASE_*).
 */
import { clusterCache } from '@/couchbase/node';
import type { MetricTable } from '@/types';
import { DisplayType, MetricsDataType } from '@/types';

import { expMetric, type ExpPoint } from './expHistogramFixtures';
import {
  ensureCollection,
  liveConnection,
  probeLive,
  runChart,
  seed,
} from './liveCluster';

const conn = liveConnection('d22-exp-histogram-count');
const EXP = 'd22_metrics_exponential_histogram';
const metricTables = {
  [MetricsDataType.ExponentialHistogram.toLowerCase()]: EXP,
} as MetricTable;

const NOW = new Date('2022-01-05T00:00:00.000Z').getTime();
const plus = (seconds: number) => new Date(NOW + seconds * 1000);

type Row = Record<string, unknown>;

const metric = (name: string, points: ExpPoint[], temporality = 2) =>
  expMetric(plus, name, points, temporality);

const grouped = (attrs: Record<string, string>, values: number[]) =>
  metric('count.grouped', [
    { at: 0, attrs, values: [] },
    { at: 60, attrs, values },
  ]);

let live = false;

beforeAll(async () => {
  live = await probeLive(conn, 'D22 exponential-histogram count');
  if (!live) return;
  await ensureCollection(EXP);
  await seed(EXP, [
    ...metric(
      'count.delta',
      [
        { at: 0, values: [-4, 0, 2] },
        { at: 60, values: [2, 4] },
      ],
      1,
    ),
    ...metric('count.missing.predecessor', [
      { at: 60, start: -600, values: [2, 4, 8] },
    ]),
    ...metric('count.unknown.reset', [
      { at: 0, start: -60, values: [2, 4] },
      { at: 60, start: 60, values: [-4, 0, 2] },
      { at: 120, start: 60, values: [-4, -2, 0, 2, 4] },
    ]),
    ...metric('count.known.reset', [
      { at: 0, start: -60, values: [2, 4, 8] },
      { at: 60, start: 30, values: [-4, 0] },
    ]),
    ...metric('count.decrease', [
      { at: 0, start: -60, values: [2, 4, 8] },
      { at: 60, start: -60, values: [16] },
    ]),
    ...metric('count.scale.change', [
      { at: 0, start: -60, values: [2], scale: 1 },
      { at: 60, start: -60, values: [-16, 0, 2, 4], scale: -1 },
    ]),
    ...grouped({ host: 'host-a', service: 'api' }, [2, 4]),
    ...grouped({ host: 'host-a', service: 'worker' }, [8]),
    ...grouped({ host: 'host-b', service: 'api' }, [16, 32, 64]),
    ...metric('reset.grouped', [
      { at: 0, start: -60, attrs: { route: '/known' }, values: [2, 2] },
      { at: 60, start: -60, attrs: { route: '/known' }, values: [2, 2, 4, 4] },
      { at: 120, start: 90, attrs: { route: '/known' }, values: [8, 8] },
    ]),
    ...metric('reset.grouped', [
      {
        at: 0,
        start: -60,
        attrs: { route: '/decrease' },
        values: [2, 2, 4, 4],
      },
      {
        at: 60,
        start: -60,
        attrs: { route: '/decrease' },
        values: [2, 2, 4, 4, 8, 8],
      },
      { at: 120, start: -60, attrs: { route: '/decrease' }, values: [16, 16] },
    ]),
    ...metric('reset.grouped', [
      { at: 0, start: -60, attrs: { route: '/unknown' }, values: [2, 2] },
      { at: 60, start: 60, attrs: { route: '/unknown' }, values: [4, 4] },
      {
        at: 120,
        start: 60,
        attrs: { route: '/unknown' },
        values: [4, 4, 8, 8],
      },
    ]),
  ]);
}, 120_000);

afterAll(async () => {
  await clusterCache.closeAll();
});

const count = async (
  metricName: string,
  extra: Record<string, unknown> = {},
): Promise<Row[]> =>
  (await runChart(conn, {
    displayType: DisplayType.Line,
    connection: 'c',
    from: { databaseName: 'test', scopeName: 'app', tableName: '' },
    metricTables,
    select: [
      {
        aggFn: 'count',
        metricName,
        metricType: MetricsDataType.ExponentialHistogram,
        valueExpression: 'Value',
        aggCondition: '',
      },
    ],
    where: '',
    timestampValueExpression: 'TimeUnix',
    dateRange: [plus(0), plus(180)],
    granularity: '1 minute',
    ...extra,
  })) as Row[];

/** Upstream's sort: time bucket, then group. */
const shape = (rows: Row[]) =>
  rows
    .map(r => ({
      ...(r.__hdx_time_bucket != null
        ? {
            at: (new Date(String(r.__hdx_time_bucket)).getTime() - NOW) / 1000,
          }
        : {}),
      ...(r.group != null ? { group: r.group } : {}),
      Value: Number(r.Value),
    }))
    .sort(
      (a, b) =>
        (a.at ?? 0) - (b.at ?? 0) ||
        JSON.stringify(a.group ?? []).localeCompare(
          JSON.stringify(b.group ?? []),
        ),
    );

describe('D22 exponential-histogram count on a live cluster', () => {
  it('counts delta-temporality observations directly', async () => {
    if (!live) return;
    expect(shape(await count('count.delta'))).toEqual([
      { at: 0, Value: 3 },
      { at: 60, Value: 2 },
    ]);
  });

  it('does not attribute a predecessor-less cumulative count to its first visible bucket', async () => {
    if (!live) return;
    expect(shape(await count('count.missing.predecessor'))).toEqual([
      { at: 60, Value: 0 },
    ]);
  });

  it('suppresses an unknown-start reset and uses it as the next baseline', async () => {
    if (!live) return;
    expect(shape(await count('count.unknown.reset'))).toEqual([
      { at: 0, Value: 0 },
      { at: 60, Value: 0 },
      { at: 120, Value: 2 },
    ]);
  });

  it('uses the current count after a known cumulative reset', async () => {
    if (!live) return;
    expect(shape(await count('count.known.reset'))).toEqual([
      { at: 0, Value: 0 },
      { at: 60, Value: 2 },
    ]);
  });

  it('uses the current count after a decrease-inferred cumulative reset', async () => {
    if (!live) return;
    expect(shape(await count('count.decrease'))).toEqual([
      { at: 0, Value: 0 },
      { at: 60, Value: 1 },
    ]);
  });

  it('keeps count continuity across scale and bucket-layout changes', async () => {
    if (!live) return;
    expect(shape(await count('count.scale.change'))).toEqual([
      { at: 0, Value: 0 },
      { at: 60, Value: 3 },
    ]);
  });

  it('sums series by the requested group and time bucket', async () => {
    if (!live) return;
    // host-a has two series (api, worker): each subtracts its own empty
    // baseline, 2 + 1 = 3. A shared partition subtracts across series.
    expect(
      shape(await count('count.grouped', { groupBy: "Attributes['host']" })),
    ).toEqual([
      { at: 0, group: ['host-a'], Value: 0 },
      { at: 0, group: ['host-b'], Value: 0 },
      { at: 60, group: ['host-a'], Value: 3 },
      { at: 60, group: ['host-b'], Value: 3 },
    ]);
  });

  it('aggregates every exponential-histogram reset mode across each non-timeseries group', async () => {
    if (!live) return;
    // /known: two 4s, then a changed start makes the two 8s a reset delta.
    // /decrease: two 8s, then the decrease makes the two 16s a reset delta.
    // /unknown: zero at StartTimeUnix == TimeUnix, then two 8s.
    const rows = await count('reset.grouped', {
      displayType: DisplayType.Table,
      granularity: undefined,
      groupBy: "Attributes['route']",
    });
    expect(rows.every(r => !('__hdx_time_bucket' in r))).toBe(true);
    expect(shape(rows)).toEqual(
      expect.arrayContaining([
        { group: ['/known'], Value: 4 },
        { group: ['/decrease'], Value: 4 },
        { group: ['/unknown'], Value: 2 },
      ]),
    );
    expect(rows).toHaveLength(3);
    // The same case's quantile half: the quantile partitions in a later
    // CTE, where `series_key` is a column, so it already held.
    const p50 = await count('reset.grouped', {
      displayType: DisplayType.Table,
      granularity: undefined,
      groupBy: "Attributes['route']",
      select: [
        {
          aggFn: 'quantile',
          level: 0.5,
          metricName: 'reset.grouped',
          metricType: MetricsDataType.ExponentialHistogram,
          valueExpression: 'Value',
          aggCondition: '',
        },
      ],
    });
    expect(p50).toHaveLength(3);
    const byRoute = Object.fromEntries(
      p50.map(r => [(r.group as string[])[0], Number(r.Value)]),
    );
    expect(byRoute['/known']).toBeCloseTo(4, 9);
    expect(byRoute['/decrease']).toBeCloseTo(8, 9);
    expect(byRoute['/unknown']).toBeCloseTo(Math.sqrt(32), 9);
  });
});
