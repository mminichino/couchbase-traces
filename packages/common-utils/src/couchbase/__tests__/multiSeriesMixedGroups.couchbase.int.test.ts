/**
 * D20: grouped charts mixing gauge or sum series with histogram series, run
 * on a live cluster. Ports upstream queryChartConfig.int.test.ts `grpmix`
 * cases (same inputs, same result shape). Requires port/couchbase-test
 * (CBT_TEST_COUCHBASE_*).
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

const conn = liveConnection('d20-mixed-groups');
const COLLECTIONS = {
  gauge: 'd20_metrics_gauge',
  histogram: 'd20_metrics_histogram',
} as const;
const metricTables = {
  [MetricsDataType.Gauge.toLowerCase()]: COLLECTIONS.gauge,
  [MetricsDataType.Histogram.toLowerCase()]: COLLECTIONS.histogram,
} as MetricTable;

const T0 = new Date('2025-04-15T10:00:00.000Z');
const minute = (m: number) => toIso30(new Date(T0.getTime() + m * 60_000));
const DATE_RANGE: [Date, Date] = [
  new Date('2025-04-14T00:00:00.000Z'),
  new Date('2025-04-16T00:00:00.000Z'),
];

type Row = Record<string, unknown>;
const col = (row: Row | undefined, name: string): unknown =>
  row == null ? undefined : new Map(Object.entries(row)).get(name);
const expectGap = (value: unknown) => {
  expect(value == null || Number.isNaN(Number(value))).toBe(true);
};
const bucketMs = (row: Row | undefined) =>
  new Date(String(col(row, '__hdx_time_bucket'))).getTime();

let live = false;

beforeAll(async () => {
  live = await probeLive(conn, 'D20 mixed gauge and histogram groups');
  if (!live) return;
  for (const c of Object.values(COLLECTIONS)) await ensureCollection(c);
  const common = (MetricName: string, service: string, m: number) => ({
    MetricName,
    ServiceName: service,
    ResourceAttributes: { 'service.name': service },
    ScopeAttributes: {},
    Attributes: {},
    StartTimeUnix: minute(0),
    TimeUnix: minute(m),
  });
  await seed(COLLECTIONS.gauge, [
    { ...common('grpmix.gauge', 'svc-a', 1), Value: 42 },
    // Two services in one bucket: they must stay two rows beside a histogram.
    { ...common('grpmix.multi', 'svc-a', 1), Value: 1 },
    { ...common('grpmix.multi', 'svc-b', 1), Value: 2 },
  ]);
  // Cumulative: the zero baseline, then 10 observations in (0, 10], so p50
  // at minute 1 interpolates to 5 and the all-zero minute 0 has no row.
  const hist = (m: number, counts: number[]) => ({
    ...common('grpmix.latency', 'svc-a', m),
    AggregationTemporality: 2,
    ExplicitBounds: [10, 30],
    BucketCounts: counts,
    Count: counts.reduce((a, b) => a + b, 0),
    Sum: 0,
  });
  await seed(COLLECTIONS.histogram, [hist(0, [0, 0, 0]), hist(1, [10, 0, 0])]);
}, 120_000);

afterAll(async () => {
  await clusterCache.closeAll();
});

const gauge = (metricName: string) => ({
  aggFn: 'avg',
  aggCondition: '',
  aggConditionLanguage: 'sql',
  valueExpression: 'Value',
  metricName,
  metricType: MetricsDataType.Gauge,
});
const quantile = {
  aggFn: 'quantile',
  level: 0.5,
  aggCondition: '',
  aggConditionLanguage: 'sql',
  valueExpression: 'Value',
  metricName: 'grpmix.latency',
  metricType: MetricsDataType.Histogram,
};

const chart = (extra: Record<string, unknown>) =>
  runChart(conn, {
    displayType: DisplayType.Line,
    connection: 'c',
    from: { databaseName: 'test', scopeName: 'app', tableName: '' },
    metricTables,
    select: [gauge('grpmix.gauge'), quantile],
    where: '',
    whereLanguage: 'sql',
    timestampValueExpression: 'TimeUnix',
    dateRange: DATE_RANGE,
    granularity: '1 minute',
    groupBy: [{ aggCondition: '', valueExpression: 'ServiceName' }],
    ...extra,
  }) as Promise<Row[]>;

describe('D20 mixed gauge and histogram groups on a live cluster', () => {
  it('keeps grouped histogram rows separate from gauge rows (Array "group" column)', async () => {
    if (!live) return;
    const data = await chart({});
    expect(data).toHaveLength(2);

    const gaugeRow = data.find(r => col(r, 'avg(grpmix.gauge)') != null);
    expect(Number(col(gaugeRow, 'avg(grpmix.gauge)'))).toBe(42);
    expect(col(gaugeRow, 'ServiceName')).toBe('svc-a');
    expect(col(gaugeRow, 'group')).toEqual([]);
    expect(bucketMs(gaugeRow)).toBe(T0.getTime() + 60_000);
    expectGap(col(gaugeRow, 'quantile(grpmix.latency)'));

    const histRow = data.find(r => col(r, 'quantile(grpmix.latency)') != null);
    expect(Number(col(histRow, 'quantile(grpmix.latency)'))).toBeCloseTo(5, 5);
    expect(col(histRow, 'group')).toEqual(['svc-a']);
    expect(col(histRow, 'ServiceName')).toBeNull();
    expect(bucketMs(histRow)).toBe(T0.getTime() + 60_000);
    expectGap(col(histRow, 'avg(grpmix.gauge)'));
  });

  it('keeps one row per gauge group beside a histogram series', async () => {
    if (!live) return;
    const data = await chart({
      select: [gauge('grpmix.multi'), quantile],
    });
    const gaugeRows = data.filter(r => col(r, 'avg(grpmix.multi)') != null);
    expect(
      gaugeRows
        .map(r => [col(r, 'ServiceName'), Number(col(r, 'avg(grpmix.multi)'))])
        .sort(),
    ).toEqual([
      ['svc-a', 1],
      ['svc-b', 2],
    ]);
    expect(data).toHaveLength(3);
  });

  it('sorts mixed gauge + histogram branches on a raw expression group-by (NULL-padded)', async () => {
    if (!live) return;
    const key = "ResourceAttributes['service.name']";
    const data = await chart({
      groupBy: [{ aggCondition: '', valueExpression: key }],
      orderBy: [{ valueExpression: key, ordering: 'ASC' }],
    });
    expect(data).toHaveLength(2);
    // Non-NULL sort key (the gauge row) first, NULL (histogram) last.
    expect(Number(col(data[0], 'avg(grpmix.gauge)'))).toBe(42);
    expect(col(data[0], key)).toBe('svc-a');
    expect(Number(col(data[1], 'quantile(grpmix.latency)'))).toBeCloseTo(5, 5);
  });

  it('applies HAVING across heterogeneous branch classes (gauge + histogram)', async () => {
    if (!live) return;
    const rows = await chart({
      having: '"avg(grpmix.gauge)" >= 0',
      havingLanguage: 'sql',
    });
    expect(rows).toHaveLength(1);
    expect(col(rows[0], 'ServiceName')).toBe('svc-a');
    expect(Number(col(rows[0], 'avg(grpmix.gauge)'))).toBe(42);
    expectGap(col(rows[0], 'quantile(grpmix.latency)'));
  });

  it('places the group-by columns on the gauge rows of a mixed table', async () => {
    if (!live) return;
    const rows = await chart({
      displayType: DisplayType.Table,
      granularity: undefined,
      groupBy: [
        { aggCondition: '', valueExpression: 'ServiceName' },
        {
          aggCondition: '',
          valueExpression: "ResourceAttributes['service.name']",
          alias: 'service',
        },
      ],
    });
    const gaugeRow = rows.find(r => col(r, 'avg(grpmix.gauge)') != null);
    expect(col(gaugeRow, 'ServiceName')).toBe('svc-a');
    expect(col(gaugeRow, 'service')).toBe('svc-a');
    const histRow = rows.find(r => col(r, 'quantile(grpmix.latency)') != null);
    expect(col(histRow, 'group')).toEqual(['svc-a', 'svc-a']);
  });
});
