/**
 * D17: HAVING, ORDER BY and LIMIT on multi-series and ratio metric charts,
 * run on a live cluster. Requires port/couchbase-test (CBT_TEST_COUCHBASE_*).
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

const conn = liveConnection('d17-multi-series-outer');
const GAUGE = 'd17_metrics_gauge';

const WINDOW: [Date, Date] = [
  new Date('2023-11-16T22:05:00.000Z'),
  new Date('2023-11-16T22:10:00.000Z'),
];

// errors / requests: a 5 / 10 = 0.5, b 3 / 30 = 0.1, c 8 / 20 = 0.4. Out of
// the 60 requests in total: a 0.0833, b 0.05, c 0.1333.
const POINTS: [string, number, number][] = [
  ['service-a', 5, 10],
  ['service-b', 3, 30],
  ['service-c', 8, 20],
];

let live = false;

beforeAll(async () => {
  live = await probeLive(conn, 'D17 multi-series outer clauses');
  if (!live) return;
  await ensureCollection(GAUGE);
  const point = (MetricName: string, Value: number, svc: string) => ({
    MetricName,
    Value,
    TimeUnix: toIso30(new Date(WINDOW[0].getTime() + 60_000)),
    ServiceName: svc,
    Attributes: {},
    ResourceAttributes: { 'service.name': svc },
    ScopeAttributes: {},
  });
  await seed(
    GAUGE,
    POINTS.flatMap(([svc, errors, requests]) => [
      point('test.errors', errors, svc),
      point('test.requests', requests, svc),
    ]),
  );
}, 120_000);

afterAll(async () => {
  await clusterCache.closeAll();
});

const tile = (extra: Record<string, unknown>) =>
  runChart(conn, {
    connection: 'c',
    displayType: DisplayType.Table,
    from: { databaseName: 'test', scopeName: 'app', tableName: '' },
    metricTables: {
      [MetricsDataType.Gauge.toLowerCase()]: GAUGE,
    } as MetricTable,
    select: [
      ['test.errors', 'errors'],
      ['test.requests', 'requests'],
    ].map(([metricName, alias]) => ({
      aggFn: 'max',
      valueExpression: 'Value',
      metricType: MetricsDataType.Gauge,
      metricName,
      alias,
      aggCondition: '',
      aggConditionLanguage: 'sql',
    })),
    groupBy: 'ServiceName',
    timestampValueExpression: 'TimeUnix',
    where: '',
    dateRange: WINDOW,
    ...extra,
  });

const services = (rows: Record<string, unknown>[], key = 'ServiceName') =>
  rows.map(r => new Map(Object.entries(r)).get(key));

describe('D17 multi-series HAVING / ORDER BY / LIMIT on a live cluster', () => {
  it('filters on an operand column and sorts by another', async () => {
    if (!live) return;
    const rows = await tile({
      having: '"errors" > 4',
      havingLanguage: 'sql',
      orderBy: [{ valueExpression: '"requests"', ordering: 'DESC' }],
    });
    expect(services(rows)).toEqual(['service-c', 'service-a']);
  });

  it('applies limit and offset after the sort', async () => {
    if (!live) return;
    const rows = await tile({
      orderBy: '"errors" DESC',
      limit: { limit: 1, offset: 1 },
    });
    expect(services(rows)).toEqual(['service-a']);
  });

  it('filters and sorts a share_of_total ratio (window function)', async () => {
    if (!live) return;
    const rows = await tile({
      seriesReturnType: 'ratio',
      ratioMode: 'share_of_total',
      having: '"errors/requests" >= 0.08',
      havingLanguage: 'sql',
      orderBy: [{ valueExpression: '"errors/requests"', ordering: 'DESC' }],
    });
    expect(services(rows)).toEqual(['service-c', 'service-a']);
    expect(Number(rows[0]['errors/requests'])).toBeCloseTo(8 / 60, 10);
  });

  it('filters on a formula column, sorted by the group-by text', async () => {
    if (!live) return;
    const rows = await tile({
      formulas: [{ expression: 'A / B', alias: 'err rate' }],
      having: '"err rate" > 0.2',
      havingLanguage: 'sql',
      orderBy: 'ServiceName',
    });
    expect(services(rows)).toEqual(['service-a', 'service-c']);
    expect(rows.map(r => Number(r['err rate']))).toEqual([0.5, 0.4]);
  });

  it('sorts by a map-key group-by expression', async () => {
    if (!live) return;
    const key = "ResourceAttributes['service.name']";
    const rows = await tile({
      groupBy: key,
      orderBy: [{ valueExpression: key, ordering: 'DESC' }],
    });
    expect(services(rows, key)).toEqual([
      'service-c',
      'service-b',
      'service-a',
    ]);
  });

  it('keeps a time chart bucket-ordered with the user sort as tiebreaker', async () => {
    if (!live) return;
    const rows = await tile({
      displayType: DisplayType.Line,
      granularity: '5 minute',
      orderBy: [{ valueExpression: 'ServiceName', ordering: 'DESC' }],
    });
    expect(services(rows)).toEqual(['service-c', 'service-b', 'service-a']);
  });

  it('filters the number shape, which has no GROUP BY', async () => {
    if (!live) return;
    const number = (having: string) =>
      tile({
        displayType: DisplayType.Number,
        groupBy: undefined,
        having,
        havingLanguage: 'sql',
      });
    expect(await number('"errors" > 100')).toEqual([]);
    const rows = await number('"errors" > 1');
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].errors)).toBe(8);
  });
});
