/**
 * D10: page query shapes that only the query engine rejects (syntax errors on
 * dotted aliases and parenthesized IN lists, 4210 on reused select aliases,
 * unknown CRC32). Requires port/couchbase-test (CBT_TEST_COUCHBASE_*).
 */
import { setChartSelectsAlias } from '@/core/chartConfig';
import { crc32 } from '@/couchbase/fn/scalar';
import { clusterCache } from '@/couchbase/node';
import { toIso30 } from '@/couchbase/time';
import type { MetricTable } from '@/types';
import { DisplayType, MetricsDataType } from '@/types';

import {
  ensureCollection,
  liveConnection,
  probeLive,
  runChart,
  runSql,
  seed,
} from './liveCluster';

const conn = liveConnection('d10-page-queries');

const COLLECTIONS = {
  gauge: 'd10_metrics_gauge',
  sum: 'd10_metrics_sum',
  spans: 'd10_spans',
} as const;
const metricTables = {
  [MetricsDataType.Gauge.toLowerCase()]: COLLECTIONS.gauge,
  [MetricsDataType.Sum.toLowerCase()]: COLLECTIONS.sum,
} as MetricTable;

const START = new Date('2026-03-01T10:00:00.000Z');
const END = new Date('2026-03-01T11:00:00.000Z');
const at = (s: number) =>
  toIso30(new Date(START.getTime() + 600_000 + s * 1000));

let live = false;

/** The single-series config /kubernetes builds (convertV1ChartConfigToV2). */
const k8sSeries = (
  metricName: string,
  metricType: MetricsDataType,
  aggFn: string | undefined,
  selectExtra: Record<string, unknown> = {},
) =>
  setChartSelectsAlias({
    select: [
      {
        aggFn,
        metricType,
        valueExpression: `${metricName} - ${metricType}`,
        metricName,
        aggConditionLanguage: 'lucene',
        aggCondition: '',
        ...selectExtra,
      },
    ],
    from: { databaseName: 'test', scopeName: 'app', tableName: '' },
    groupBy: "ResourceAttributes['k8s.pod.name']",
    dateRange: [START, END],
    connection: 'c',
    metricTables,
    timestampValueExpression: 'TimeUnix',
    where: '',
    granularity: '1 hour',
    displayType: DisplayType.Line,
  } as never);

const pod = (name: string) => ({
  Attributes: {},
  ResourceAttributes: { 'k8s.pod.name': name },
  ScopeAttributes: {},
});

beforeAll(async () => {
  live = await probeLive(conn, 'D10 page queries');
  if (!live) return;
  for (const c of Object.values(COLLECTIONS)) await ensureCollection(c);
  await seed(COLLECTIONS.gauge, [
    {
      MetricName: 'k8s.pod.cpu.utilization',
      TimeUnix: at(1),
      Value: 0.2,
      ...pod('a'),
    },
    {
      MetricName: 'k8s.pod.cpu.utilization',
      TimeUnix: at(2),
      Value: 0.4,
      ...pod('a'),
    },
    {
      MetricName: 'k8s.pod.cpu.usage',
      TimeUnix: at(3),
      Value: 0.9,
      ...pod('b'),
    },
  ]);
  await seed(COLLECTIONS.sum, [
    {
      MetricName: 'k8s.pod.uptime',
      TimeUnix: at(1),
      Value: 100,
      AggregationTemporality: 2,
      ...pod('a'),
    },
    {
      MetricName: 'k8s.pod.uptime',
      TimeUnix: at(5),
      Value: 160,
      AggregationTemporality: 2,
      ...pod('a'),
    },
  ]);
  await seed(COLLECTIONS.spans, [
    { Timestamp: at(1), ServiceName: 'api', StatusCode: 'Ok', Duration: 2e6 },
    {
      Timestamp: at(2),
      ServiceName: 'api',
      StatusCode: 'Error',
      Duration: 4e6,
    },
    { Timestamp: at(3), ServiceName: 'api', StatusCode: 'Ok', Duration: 6e6 },
    {
      Timestamp: at(4),
      ServiceName: 'api',
      StatusCode: 'Error',
      Duration: 8e6,
    },
  ]);
}, 120000);

afterAll(async () => {
  await clusterCache.closeAll();
});

/** Rows as { pod: value } for the one series column besides the bucket. */
const byPod = (rows: Record<string, unknown>[], alias: string) =>
  Object.fromEntries(
    rows.map(r => {
      const entries = Object.entries(r);
      const pod = entries.find(([, v]) => v === 'a' || v === 'b')?.[1];
      const value = entries.find(([k]) => k === alias)?.[1];
      return [String(pod), Number(value)];
    }),
  );

describe('D10 /kubernetes metric series on a live cluster', () => {
  // Gauges take each series' last value in the bucket before aggregating
  // (upstream semantics), so pod a's avg is its last point, 0.4.
  it('runs a dotted gauge alias grouped by pod', async () => {
    if (!live) return;
    const rows = await runChart(
      conn,
      k8sSeries('k8s.pod.cpu.utilization', MetricsDataType.Gauge, 'avg'),
    );
    expect(byPod(rows, 'avg(k8s.pod.cpu.utilization)')).toEqual({
      a: 0.4,
    });
  });

  it('runs the semantic-convention metric name IN list', async () => {
    if (!live) return;
    const rows = await runChart(
      conn,
      k8sSeries('k8s.pod.cpu.utilization', MetricsDataType.Gauge, 'max', {
        metricNameSql:
          "MetricName IN ('k8s.pod.cpu.utilization', 'k8s.pod.cpu.usage')",
      }),
    );
    expect(byPod(rows, 'max(k8s.pod.cpu.utilization)')).toEqual({
      a: 0.4,
      b: 0.9,
    });
  });

  it('runs a Sum series with no aggFn (last cumulative value)', async () => {
    if (!live) return;
    const rows = await runChart(
      conn,
      k8sSeries('k8s.pod.uptime', MetricsDataType.Sum, undefined),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveProperty(['undefined(k8s.pod.uptime)']);
  });
});

describe('D10 /services select alias reuse on a live cluster', () => {
  it('computes a ratio of earlier select aliases and a converted quantile', async () => {
    if (!live) return;
    const rows = await runChart(conn, {
      displayType: DisplayType.Table,
      connection: 'c',
      from: {
        databaseName: 'test',
        scopeName: 'app',
        tableName: COLLECTIONS.spans,
      },
      select: [
        { aggFn: 'count', alias: 'total_requests', valueExpression: '' },
        {
          aggFn: 'count',
          alias: 'error_requests',
          valueExpression: '',
          aggCondition: "StatusCode = 'Error'",
          aggConditionLanguage: 'sql',
        },
        {
          alias: 'error_rate',
          valueExpression: 'error_requests / total_requests',
        },
        { aggFn: 'max', alias: 'max_ns', valueExpression: 'Duration' },
        { alias: 'max_ms', valueExpression: 'max_ns / 1e6' },
      ],
      groupBy: 'ServiceName',
      where: '',
      timestampValueExpression: 'Timestamp',
      dateRange: [START, END],
    });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.error_rate)).toBe(0.5);
    expect(Number(rows[0]!.max_ms)).toBe(8);
  });
});

describe('D10 /llm and /sessions select aliases on a live cluster', () => {
  const base = {
    displayType: DisplayType.Table,
    connection: 'c',
    from: {
      databaseName: 'test',
      scopeName: 'app',
      tableName: COLLECTIONS.spans,
    },
    where: '',
    timestampValueExpression: 'Timestamp',
    dateRange: [START, END] as [Date, Date],
  };

  // /llm cost table: a ratio of an alias defined later in the list, a
  // double-quoted alias reference, and GROUP BY a select alias.
  it('groups by a select alias and resolves forward and quoted references', async () => {
    if (!live) return;
    const rows = await runChart(conn, {
      ...base,
      select: [
        { alias: 'Service', valueExpression: "coalesce(ServiceName, 'none')" },
        {
          alias: 'error_share',
          valueExpression: 'errors / greatest("Calls", 1)',
        },
        { aggFn: 'count', alias: 'Calls', valueExpression: '' },
        {
          aggFn: 'count',
          alias: 'errors',
          valueExpression: '',
          aggCondition: "StatusCode = 'Error'",
          aggConditionLanguage: 'sql',
        },
      ],
      groupBy: 'Service',
    });
    // count() is UInt64 upstream, which ClickHouse JSON quotes; the ratio is
    // a Float64 and stays a number.
    expect(rows).toEqual([
      expect.objectContaining({
        Service: 'api',
        Calls: '4',
        errors: '2',
        error_share: 0.5,
      }),
    ]);
  });

  // /sessions list: GROUP BY two select aliases of plain columns.
  it('groups by plain-column select aliases', async () => {
    if (!live) return;
    const rows = await runChart(conn, {
      ...base,
      select: [
        { alias: 'serviceName', valueExpression: 'ServiceName' },
        { alias: 'status', valueExpression: 'StatusCode' },
        { aggFn: 'count', alias: 'n', valueExpression: '' },
      ],
      groupBy: [
        { valueExpression: 'serviceName' },
        { valueExpression: 'status' },
      ],
      orderBy: 'status',
    } as never);
    expect(rows.map(r => [r.serviceName, r.status, Number(r.n)])).toEqual([
      ['api', 'Error', 2],
      ['api', 'Ok', 2],
    ]);
  });
});

describe('D10 /service-map crc32 sampling on a live cluster', () => {
  it('matches the standard CRC-32 checksum', async () => {
    if (!live) return;
    const rows = await runSql(
      conn,
      `SELECT ${crc32('$s')} AS h, MOD(${crc32('$s')}, 2) AS m`,
      { s: 'hello' },
    );
    // zlib.crc32('hello') === 0x3610a686
    expect(rows.map(r => [Number(r.h), Number(r.m)])).toEqual([
      [0x3610a686, 0],
    ]);
  });
});
