/**
 * D24 + D25 on a live cluster. Metric charts honor the chart `where`
 * (SQL by default, or Lucene), `filters`, and aggConditions in the source
 * CTE, as upstream renderMetricWhere does, and an unaliased Sum select
 * returns a `Value` column. Ports upstream
 * api/src/clickhouse/__tests__/renderChartConfig.int.test.ts "ignores other
 * metrics, filtered attribute series, and points outside the requested
 * range", "excludes lower-scale filtered series and unrelated metrics
 * before choosing the normalized scale", and "sum values as without rate
 * computation" (same inputs and rows; that case's `'5 minutes'` is written
 * `'5 minute'`, the only form SQLIntervalSchema accepts). Gauge, histogram
 * `filters`, and aggCondition cases follow the same rule on this port's
 * fixtures. Requires port/couchbase-test (CBT_TEST_COUCHBASE_*).
 */
import { clusterCache } from '@/couchbase/node';
import { declaredColumns } from '@/couchbase/otelSchema';
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

const conn = liveConnection('d24-metric-where');
const EXP = 'd24_metrics_exponential_histogram';
const HIST = 'd24_metrics_histogram';
const SUM = 'd24_metrics_sum';
const GAUGE = 'd24_metrics_gauge';
const metricTables = {
  [MetricsDataType.ExponentialHistogram.toLowerCase()]: EXP,
  [MetricsDataType.Histogram.toLowerCase()]: HIST,
  [MetricsDataType.Sum.toLowerCase()]: SUM,
  [MetricsDataType.Gauge.toLowerCase()]: GAUGE,
} as MetricTable;

// Lucene compiles against column metadata (an unknown field is FALSE); these
// collections hold the declared OTel metric columns.
const metadata = {
  getColumns: async ({ tableName }: { tableName: string }) =>
    declaredColumns(tableName.replace(/^d24_/, 'otel_')) ?? [],
};

const NOW = new Date('2022-01-05T00:00:00.000Z').getTime();
const plus = (seconds: number) => new Date(NOW + seconds * 1000);

type Row = Record<string, unknown>;

const otel = (
  MetricName: string,
  seconds: number,
  over: Record<string, unknown> = {},
) => ({
  MetricName,
  ServiceName: 'api',
  ResourceAttributes: {},
  ScopeAttributes: {},
  Attributes: {},
  AggregationTemporality: 2,
  StartTimeUnix: toIso30(plus(-600)),
  TimeUnix: toIso30(plus(seconds)),
  ...over,
});

let live = false;

beforeAll(async () => {
  live = await probeLive(conn, 'D24 metric where');
  if (!live) return;
  await Promise.all([EXP, HIST, SUM, GAUGE].map(ensureCollection));
  const route = (r: string) => ({ route: r });
  await seed(EXP, [
    ...expMetric(plus, 'isolated.metric', [
      { at: 0, attrs: route('/target'), values: [] },
      { at: 60, attrs: route('/target'), values: [2, 4] },
      { at: 180, attrs: route('/target'), values: [2, 4, 1024, 1024] },
    ]),
    ...expMetric(plus, 'isolated.metric', [
      { at: 0, attrs: route('/noise'), values: [] },
      { at: 60, attrs: route('/noise'), values: [1024, 1024] },
    ]),
    ...expMetric(plus, 'unrelated.metric', [
      { at: 0, values: [] },
      { at: 60, values: [2048, 2048] },
    ]),
    ...expMetric(plus, 'filtered.scale.isolation', [
      { at: 0, attrs: route('/target'), values: [], scale: 1 },
      { at: 60, attrs: route('/target'), values: [2, 2], scale: 1 },
    ]),
    ...expMetric(
      plus,
      'filtered.scale.isolation',
      [{ at: 60, attrs: route('/noise'), values: [2 ** 512], scale: -10 }],
      1,
    ),
    ...expMetric(
      plus,
      'filtered.scale.unrelated.metric',
      [{ at: 60, attrs: route('/target'), values: [2 ** 512], scale: -10 }],
      1,
    ),
  ]);
  // Upstream's podAgePoints, plus one series from another service that the
  // Lucene where must exclude (upstream seeds only ServiceName api).
  await seed(SUM, [
    ...[
      [-60, 518400],
      [0, 604800],
      [60, 691200],
      [120, 777600],
      [180, 864000],
      [240, 950400],
      [720, 1641600],
    ].map(([at, Value]) =>
      otel('k8s.pod.uptime', at, {
        ResourceAttributes: { host: 'cluster-node-1', ip: '127.0.0.1' },
        IsMonotonic: true,
        Value,
      }),
    ),
    ...[
      [0, 5],
      [720, 99_999_999],
    ].map(([at, Value]) =>
      otel('k8s.pod.uptime', at, {
        ServiceName: 'other',
        IsMonotonic: true,
        Value,
      }),
    ),
  ]);
  await seed(HIST, [
    ...[
      ['/a', [0, 0], [4, 0]],
      ['/b', [0, 0], [0, 50]],
    ].flatMap(([r, first, second]) =>
      [first, second].map((counts, i) =>
        otel('hist.routes', i * 60, {
          Attributes: route(r as string),
          ExplicitBounds: [10],
          BucketCounts: counts,
          Count: (counts as number[]).reduce((a, b) => a + b, 0),
        }),
      ),
    ),
  ]);
  await seed(GAUGE, [
    otel('gauge.cpu', 0, { Value: 10 }),
    otel('gauge.cpu', 0, { Value: 90, ServiceName: 'worker' }),
  ]);
}, 120_000);

afterAll(async () => {
  await clusterCache.closeAll();
});

const chart = async (
  metricType: MetricsDataType,
  select: Record<string, unknown>,
  extra: Record<string, unknown>,
): Promise<Row[]> =>
  (await runChart(
    conn,
    {
      displayType: DisplayType.Line,
      connection: 'c',
      from: { databaseName: 'test', scopeName: 'app', tableName: '' },
      metricTables,
      select: [
        { metricType, valueExpression: 'Value', aggCondition: '', ...select },
      ],
      where: '',
      timestampValueExpression: 'TimeUnix',
      dateRange: [plus(0), plus(120)],
      granularity: '1 minute',
      ...extra,
    },
    metadata,
  )) as Row[];

const byBucket = (rows: Row[]) =>
  rows
    .map(r => ({
      at: (new Date(String(r.__hdx_time_bucket)).getTime() - NOW) / 1000,
      Value: Number(r.Value),
    }))
    .sort((a, b) => a.at - b.at);

const EXP_TYPE = MetricsDataType.ExponentialHistogram;
const p50 = (metricName: string) => ({
  aggFn: 'quantile',
  level: 0.5,
  metricName,
});

describe('D24/D25 metric where and Value alias on a live cluster', () => {
  it('ignores other metrics, filtered attribute series, and points outside the requested range', async () => {
    if (!live) return;
    // Upstream queryQuantile with a SQL where and no whereLanguage.
    expect(
      byBucket(
        await chart(EXP_TYPE, p50('isolated.metric'), {
          where: "Attributes['route'] = '/target'",
        }),
      ),
    ).toEqual([{ at: 60, Value: 2 }]);
  });

  it('excludes lower-scale filtered series and unrelated metrics before choosing the normalized scale', async () => {
    if (!live) return;
    const rows = await chart(EXP_TYPE, p50('filtered.scale.isolation'), {
      where: "Attributes['route'] = '/target'",
    });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].Value)).toBeCloseTo(2 ** 0.75);
  });

  it('sum values as without rate computation', async () => {
    if (!live) return;
    // No aggFn and no alias: the column is Value (D25); the Lucene where
    // keeps only ServiceName api (D24).
    const rows = await chart(
      MetricsDataType.Sum,
      { metricName: 'k8s.pod.uptime' },
      {
        where: 'ServiceName:api',
        whereLanguage: 'lucene',
        dateRange: [plus(0), plus(1200)],
        granularity: '5 minute',
      },
    );
    expect(rows.every(r => 'Value' in r)).toBe(true);
    expect(byBucket(rows)).toEqual([
      { at: 0, Value: 950400 },
      { at: 600, Value: 1641600 },
    ]);
  });

  it('applies histogram filters in the source', async () => {
    if (!live) return;
    const count = (filters: unknown[]) =>
      chart(
        MetricsDataType.Histogram,
        { aggFn: 'count', metricName: 'hist.routes' },
        { filters },
      );
    expect(
      byBucket(
        await count([{ type: 'sql', condition: "Attributes['route'] = '/a'" }]),
      ),
    ).toEqual([
      // A cumulative count's baseline bucket is a 0 row, as upstream.
      { at: 0, Value: 0 },
      { at: 60, Value: 4 },
    ]);
    expect(
      byBucket(
        await count([{ type: 'lucene', condition: 'Attributes.route:"/b"' }]),
      ),
    ).toEqual([
      // A cumulative count's baseline bucket is a 0 row, as upstream.
      { at: 0, Value: 0 },
      { at: 60, Value: 50 },
    ]);
  });

  it('applies a gauge where and an aggCondition in the source', async () => {
    if (!live) return;
    const max = (extra: Record<string, unknown>, select = {}) =>
      chart(
        MetricsDataType.Gauge,
        { aggFn: 'max', alias: 'Value', metricName: 'gauge.cpu', ...select },
        extra,
      );
    expect(byBucket(await max({ where: "ServiceName = 'api'" }))).toEqual([
      { at: 0, Value: 10 },
    ]);
    expect(
      byBucket(
        await max(
          {},
          {
            aggCondition: "ServiceName = 'worker'",
            aggConditionLanguage: 'sql',
          },
        ),
      ),
    ).toEqual([{ at: 0, Value: 90 }]);
  });
});
