/**
 * D1: chart renderer defects found by the deferred API suites (R0), run
 * against a live cluster because both the ambiguous-reference and the
 * HAVING errors are raised by the query engine, not by the renderer.
 * Requires port/couchbase-test (CBT_TEST_COUCHBASE_*).
 */
import { convertToCategoricalChartConfig } from '@/core/utils';
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

const conn = liveConnection('d1-renderer');

const COLLECTIONS = {
  logs: 'd1_logs',
  gauge: 'd1_metrics_gauge',
  sum: 'd1_metrics_sum',
  histogram: 'd1_metrics_histogram',
} as const;
const metricTables = {
  [MetricsDataType.Gauge.toLowerCase()]: COLLECTIONS.gauge,
  [MetricsDataType.Sum.toLowerCase()]: COLLECTIONS.sum,
  [MetricsDataType.Histogram.toLowerCase()]: COLLECTIONS.histogram,
} as MetricTable;

// Everything sits in one minute, well inside a one hour range.
const START = new Date('2026-03-01T10:00:00.000Z');
const END = new Date('2026-03-01T11:00:00.000Z');
const at = (s: number) =>
  toIso30(new Date(START.getTime() + 600_000 + s * 1000));

let live = false;

const metricConfig = (
  select: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) => ({
  displayType: DisplayType.Line,
  connection: 'c',
  from: { databaseName: 'test', scopeName: 'app', tableName: '' },
  metricTables,
  select: [
    {
      valueExpression: 'Value',
      aggCondition: '',
      aggConditionLanguage: 'lucene',
      alias: 'series_0',
      ...select,
    },
  ],
  where: '',
  timestampValueExpression: 'TimeUnix',
  dateRange: [START, END],
  granularity: 'auto',
  ...extra,
});

beforeAll(async () => {
  live = await probeLive(conn, 'Chart builder defects');
  if (!live) return;
  for (const c of Object.values(COLLECTIONS)) await ensureCollection(c);
  const metric = (name: string, series: string, extra: object) => ({
    MetricName: name,
    Attributes: { series },
    ResourceAttributes: { 'service.name': series },
    ScopeAttributes: {},
    ...extra,
  });
  await seed(COLLECTIONS.gauge, [
    metric('d1.gauge', 'a', { TimeUnix: at(10), Value: 10 }),
    metric('d1.gauge', 'b', { TimeUnix: at(20), Value: 40 }),
  ]);
  await seed(COLLECTIONS.sum, [
    metric('d1.sum', 'a', {
      TimeUnix: at(10),
      Value: 5,
      AggregationTemporality: 2,
    }),
    metric('d1.sum', 'a', {
      TimeUnix: at(20),
      Value: 15,
      AggregationTemporality: 2,
    }),
  ]);
  await seed(COLLECTIONS.histogram, [
    metric('d1.hist', 'a', {
      TimeUnix: at(10),
      AggregationTemporality: 1,
      ExplicitBounds: [10, 100],
      BucketCounts: [0, 10, 0],
      Count: 10,
    }),
  ]);
  const logs: Record<string, unknown>[] = [];
  for (const [service, n] of [
    ['a', 1],
    ['b', 5],
    ['c', 3],
  ] as const) {
    for (let i = 0; i < n; i++) {
      logs.push({ ServiceName: service, Body: `event ${i}`, Timestamp: at(i) });
    }
  }
  await seed(COLLECTIONS.logs, logs);
}, 120000);

afterAll(async () => {
  await clusterCache.closeAll();
});

describe('D1 chart renderer on a live cluster', () => {
  it.each([
    ['gauge', 'avg', 'd1.gauge', MetricsDataType.Gauge, 25],
    ['sum', 'sum', 'd1.sum', MetricsDataType.Sum, 10],
  ] as const)(
    "runs a %s series with granularity 'auto'",
    async (_kind, aggFn, metricName, metricType, expected) => {
      if (!live) return;
      const rows = await runChart(
        conn,
        metricConfig({ aggFn, metricName, metricType }),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toHaveProperty('__hdx_time_bucket');
      expect(Number(rows[0]!.series_0)).toBe(expected);
    },
  );

  it.each([
    ['without groupBy', {}, ['__hdx_time_bucket', 'series_0']],
    [
      'with groupBy',
      { groupBy: [{ valueExpression: 'ResourceAttributes.`service.name`' }] },
      ['__hdx_time_bucket', 'group', 'series_0'],
    ],
  ])('runs a histogram quantile time series %s', async (_l, extra, keys) => {
    if (!live) return;
    const rows = await runChart(
      conn,
      metricConfig(
        {
          aggFn: 'quantile',
          level: 0.95,
          metricName: 'd1.hist',
          metricType: MetricsDataType.Histogram,
        },
        extra,
      ),
    );
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]!).sort()).toEqual([...keys].sort());
    const v = Number(rows[0]!.series_0);
    expect(v).toBeGreaterThan(10);
    expect(v).toBeLessThanOrEqual(100);
  });

  const tableConfig = (displayType: DisplayType) => ({
    displayType,
    connection: 'c',
    from: {
      databaseName: 'test',
      scopeName: 'app',
      tableName: COLLECTIONS.logs,
    },
    select: [
      { aggFn: 'count', alias: 'n', valueExpression: '', aggCondition: '' },
    ],
    groupBy: 'ServiceName',
    where: '',
    timestampValueExpression: 'Timestamp',
    dateRange: [START, END],
    having: 'n > 1',
    havingLanguage: 'sql',
  });

  it.each([DisplayType.Table, DisplayType.Pie, DisplayType.Bar])(
    "applies having 'n > 1' to a select alias (%s)",
    async displayType => {
      if (!live) return;
      const config =
        displayType === DisplayType.Table
          ? tableConfig(displayType)
          : convertToCategoricalChartConfig(tableConfig(displayType) as never);
      const rows = await runChart(conn, config);
      expect(rows.map(r => r.ServiceName).sort()).toEqual(['b', 'c']);
      expect(rows.map(r => Number(r.n)).sort()).toEqual([3, 5]);
    },
  );
});
