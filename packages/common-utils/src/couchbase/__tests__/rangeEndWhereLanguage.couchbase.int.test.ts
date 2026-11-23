/**
 * D26 + D28 on a live cluster. D26: a row exactly at the range end is
 * returned unless `dateRangeEndInclusive` is false, in search, charts, and
 * metrics, as upstream `renderWhere`'s `dateRangeEndInclusive ?? true`.
 * D28: a `where` with no `whereLanguage` runs as SQL, as upstream's
 * `whereLanguage ?? 'sql'`. Requires port/couchbase-test
 * (CBT_TEST_COUCHBASE_*).
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

const conn = liveConnection('d26-range-end');
const LOGS = 'd26_logs';
const GAUGE = 'd26_metrics_gauge';

const metadata = {
  getColumns: async ({ tableName }: { tableName: string }) =>
    declaredColumns(tableName.replace(/^d26_/, 'otel_')) ?? [],
};

const minuteTs = (minute: number) =>
  toIso30(new Date(Date.UTC(2025, 3, 15, 10, minute)));

type Row = Record<string, unknown>;

let live = false;

beforeAll(async () => {
  live = await probeLive(conn, 'D26 range end and D28 where language');
  if (!live) return;
  await Promise.all([LOGS, GAUGE].map(ensureCollection));
  // Log rows at the range start, inside, exactly at the end, and after it.
  await seed(
    LOGS,
    [0, 2, 4, 5].map(minute => ({
      Timestamp: minuteTs(minute),
      ServiceName: minute === 2 ? 'web' : 'api',
      SeverityText: 'info',
      Body: `at ${minute}`,
    })),
  );
  await seed(
    GAUGE,
    [0, 5].map(minute => ({
      MetricName: 'gauge.cpu',
      ServiceName: 'api',
      ResourceAttributes: {},
      ScopeAttributes: {},
      Attributes: {},
      StartTimeUnix: minuteTs(0),
      TimeUnix: minuteTs(minute),
      Flags: 0,
      Value: 10,
    })),
  );
}, 120_000);

afterAll(async () => {
  await clusterCache.closeAll();
});

const range: [Date, Date] = [new Date(minuteTs(0)), new Date(minuteTs(4))];

const logs = (extra: Record<string, unknown>) =>
  runChart(
    conn,
    {
      displayType: DisplayType.Search,
      connection: 'c',
      from: { databaseName: 'test', scopeName: 'app', tableName: LOGS },
      select: 'Body',
      where: '',
      timestampValueExpression: 'Timestamp',
      dateRange: range,
      orderBy: 'Timestamp ASC',
      limit: { limit: 10 },
      ...extra,
    },
    metadata,
  ) as Promise<Row[]>;

const bodies = async (extra: Record<string, unknown>) =>
  (await logs(extra)).map(r => r.Body);

describe('D26 range end on a live cluster', () => {
  it('returns a search row exactly at the range end', async () => {
    if (!live) return;
    expect(await bodies({})).toEqual(['at 0', 'at 2', 'at 4']);
  });

  it('leaves it out when dateRangeEndInclusive is false', async () => {
    if (!live) return;
    expect(await bodies({ dateRangeEndInclusive: false })).toEqual([
      'at 0',
      'at 2',
    ]);
  });

  it('counts a chart row exactly at the range end', async () => {
    if (!live) return;
    const rows = await runChart(
      conn,
      {
        displayType: DisplayType.Number,
        connection: 'c',
        from: { databaseName: 'test', scopeName: 'app', tableName: LOGS },
        select: [
          { aggFn: 'count', valueExpression: '', aggCondition: '', alias: 'n' },
        ],
        where: '',
        timestampValueExpression: 'Timestamp',
        dateRange: range,
      },
      metadata,
    );
    // Counts come back as strings, the ClickHouse JSON shape.
    expect(rows).toEqual([{ n: '3' }]);
  });

  it('includes a gauge point exactly at the range end', async () => {
    if (!live) return;
    const buckets = async (extra: Record<string, unknown>) =>
      (
        (await runChart(
          conn,
          {
            displayType: DisplayType.Line,
            connection: 'c',
            metricTables: { gauge: GAUGE } as MetricTable,
            from: { databaseName: 'test', scopeName: 'app', tableName: '' },
            select: [
              {
                aggFn: 'count',
                aggCondition: '',
                valueExpression: 'Value',
                alias: 'Value',
                metricName: 'gauge.cpu',
                metricType: MetricsDataType.Gauge,
              },
            ],
            where: '',
            timestampValueExpression: 'TimeUnix',
            dateRange: [new Date(minuteTs(0)), new Date(minuteTs(5))],
            granularity: '1 minute',
            ...extra,
          },
          metadata,
        )) as Row[]
      )
        .map(r => [String(r.__hdx_time_bucket), Number(r.Value)])
        .sort();
    expect(await buckets({})).toEqual([
      ['2025-04-15T10:00:00Z', 1],
      ['2025-04-15T10:05:00Z', 1],
    ]);
    expect(await buckets({ dateRangeEndInclusive: false })).toEqual([
      ['2025-04-15T10:00:00Z', 1],
    ]);
  });
});

describe('D28 where with no language on a live cluster', () => {
  it('runs a SQL where with no whereLanguage', async () => {
    if (!live) return;
    expect(await bodies({ where: "ServiceName = 'web'" })).toEqual(['at 2']);
  });

  it('still runs an explicit Lucene where', async () => {
    if (!live) return;
    expect(
      await bodies({ where: 'ServiceName:web', whereLanguage: 'lucene' }),
    ).toEqual(['at 2']);
  });
});
