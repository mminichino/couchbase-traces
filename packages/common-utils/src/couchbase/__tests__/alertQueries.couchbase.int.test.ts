/**
 * D11: alert query shapes from the deferred checkAlerts cases, run on
 * a live cluster. Requires port/couchbase-test (CBT_TEST_COUCHBASE_*).
 */
import { aliasMapToWithClauses } from '@/core/utils';
import { clusterCache } from '@/couchbase/node';
import { renderChartConfigCouchbase } from '@/couchbase/render';
import { toIso30 } from '@/couchbase/time';
import { sqlExprToAliasMap } from '@/query';
import { DisplayType } from '@/types';

import {
  ensureCollection,
  liveConnection,
  probeLive,
  runChart,
  seed,
} from './liveCluster';

const conn = liveConnection('d11-alert-queries');

const LOGS = 'd11_logs';
const from = { databaseName: 'test', scopeName: 'app', tableName: LOGS };

// checkAlerts: now 22:12, 5 minute window [22:05, 22:10), events at 22:05.
const WINDOW: [Date, Date] = [
  new Date('2023-11-16T22:05:00.000Z'),
  new Date('2023-11-16T22:10:00.000Z'),
];
const EVENT = toIso30(WINDOW[0]);

let live = false;

beforeAll(async () => {
  live = await probeLive(conn, 'D11 alert queries');
  if (!live) return;
  await ensureCollection(LOGS);
  await seed(LOGS, [
    {
      Timestamp: EVENT,
      ServiceName: 'api',
      SeverityText: 'error',
      Body: 'Oh no! Something went wrong!',
    },
    {
      Timestamp: EVENT,
      ServiceName: 'api',
      SeverityText: 'info',
      Body: 'Oh no! Something went wrong!',
    },
    {
      Timestamp: EVENT,
      ServiceName: 'web',
      SeverityText: 'info',
      Body: 'Info from web service',
    },
  ]);
}, 120_000);

afterAll(async () => {
  await clusterCache.closeAll();
});

/** checkAlerts `computeAliasWithClauses`: the saved search's select aliases. */
async function aliasWith(select: string) {
  const search = await renderChartConfigCouchbase(
    {
      connection: 'c',
      displayType: DisplayType.Search,
      from,
      select,
      where: '',
      whereLanguage: 'lucene',
      timestampValueExpression: 'Timestamp',
    } as never,
    { getColumns: async () => [] },
    undefined,
  );
  return aliasMapToWithClauses(sqlExprToAliasMap(search));
}

/** The SAVED_SEARCH alert query: count per 5 minute bucket over the window. */
async function alertCounts(select: string, where: string) {
  const rows = await runChart(conn, {
    connection: 'c',
    displayType: DisplayType.Line,
    from,
    select: [{ aggFn: 'count', valueExpression: '', aggCondition: '' }],
    where,
    whereLanguage: 'lucene',
    timestampValueExpression: 'Timestamp',
    dateRange: WINDOW,
    granularity: '5 minute',
    with: await aliasWith(select),
  });
  return rows.map(r => Number(r['count()']));
}

describe('D11 saved-search alias alerts on a live cluster', () => {
  it('counts rows matched on an alias in select and where', async () => {
    if (!live) return;
    expect(await alertCounts('toString(Body) AS body', 'body:wrong')).toEqual([
      2,
    ]);
  });

  it('returns no bucket when the alias matches no row', async () => {
    if (!live) return;
    expect(
      await alertCounts(
        'toString(Body) AS body',
        'body:"does not exist anywhere"',
      ),
    ).toEqual([]);
  });

  it('filters on one of several aliases', async () => {
    if (!live) return;
    expect(
      await alertCounts(
        'toString(Body) AS body, ServiceName AS svc',
        'svc:"api"',
      ),
    ).toEqual([2]);
  });
});
