/**
 * D9: builder charts that read ClickHouse-style map keys
 * (`SpanAttributes['http.route']`) against a live cluster. SQL++ reads
 * `obj['k']` as an array index, so before the fix these tiles came back as one
 * empty group and filters matched nothing.
 */
import { MetadataCache } from '@/core/metadata';
import { Metadata } from '@/couchbase/metadata';
import { CouchbaseNodeClient } from '@/couchbase/node';
import { renderChartConfigCouchbase } from '@/couchbase/render';
import { DisplayType } from '@/types';

import {
  ensureCollection,
  liveConnection,
  probeLive,
  runChart,
  seed,
} from './liveCluster';

jest.setTimeout(120000);

const SPANS = 'd9_spans';
const conn = liveConnection('d9-live');
const T0 = Date.parse('2026-01-01T00:00:00.000Z');
const dateRange = [new Date(T0), new Date(T0 + 3_600_000)];

const span = (
  i: number,
  route: string | undefined,
  method: string,
  extra: Record<string, unknown> = {},
) => ({
  Timestamp: new Date(T0 + i * 1000).toISOString(),
  ServiceName: 'api',
  Duration: 10 * (i + 1),
  SpanAttributes: {
    ...(route != null ? { 'http.route': route } : {}),
    'http.method': method,
    "it's": 'quoted',
    ...extra,
  },
  ResourceAttributes: { 'k8s.pod.name': i % 2 === 0 ? 'pod-a' : 'pod-b' },
});

const DOCS = [
  span(0, '/users', 'GET'),
  span(1, '/users', 'GET'),
  span(2, '/users', 'POST'),
  span(3, '/orders', 'GET'),
  span(4, '/orders', 'GET', { 'a b-c': 'x' }),
  span(5, undefined, 'GET'),
];

const base = {
  displayType: DisplayType.Table,
  connection: 'd9-live',
  from: { databaseName: 'test', scopeName: 'app', tableName: SPANS },
  timestampValueExpression: 'Timestamp',
  where: '',
  whereLanguage: 'sql',
  dateRange,
};

const counts = (rows: Record<string, unknown>[], key: string) =>
  Object.fromEntries(
    rows.map(r => [
      String(new Map(Object.entries(r)).get(key)),
      Number(r['count()']),
    ]),
  );

let live = false;

beforeAll(async () => {
  live = await probeLive(conn, 'Map access');
  if (!live) return;
  await ensureCollection(SPANS);
  await seed(SPANS, DOCS);
});

describe('D9 builder map access (live)', () => {
  it('groups by a dotted map key and keeps the upstream column name', async () => {
    if (!live) return;
    const rows = await runChart(conn, {
      ...base,
      select: [{ aggFn: 'count', valueExpression: '' }],
      groupBy: [{ valueExpression: "SpanAttributes['http.route']" }],
    });
    expect(counts(rows, "SpanAttributes['http.route']")).toEqual({
      '/users': 3,
      '/orders': 2,
      '': 1,
    });
  });

  it('filters by a map key in the SQL where and in filters', async () => {
    if (!live) return;
    const rows = await runChart(conn, {
      ...base,
      select: [{ aggFn: 'count', valueExpression: '' }],
      where: "SpanAttributes['http.method'] = 'GET'",
      filters: [
        {
          type: 'sql',
          condition: "ResourceAttributes['k8s.pod.name'] IN ('pod-a')",
        },
      ],
      groupBy: "SpanAttributes['http.route']",
    });
    // GET on pod-a: spans 0 (/users) and 4 (/orders).
    expect(counts(rows, "SpanAttributes['http.route']")).toEqual({
      '/users': 1,
      '/orders': 1,
    });
  });

  it('aggregates, orders and filters groups by map keys', async () => {
    if (!live) return;
    const rows = await runChart(conn, {
      ...base,
      select: [
        { aggFn: 'count', valueExpression: '' },
        {
          aggFn: 'count',
          valueExpression: '',
          aggCondition: "SpanAttributes['http.method'] = 'POST'",
          aggConditionLanguage: 'sql',
          alias: 'posts',
        },
      ],
      groupBy: [
        { valueExpression: "SpanAttributes['http.route']", alias: 'route' },
      ],
      having: 'COUNT(*) > 1',
      havingLanguage: 'sql',
      orderBy: "SpanAttributes['http.route'] DESC",
    });
    expect(
      rows.map(r => [r.route, Number(r['count()']), Number(r.posts)]),
    ).toEqual([
      ['/users', 3, 1],
      ['/orders', 2, 0],
    ]);
  });

  it('reads keys with quotes and special characters', async () => {
    if (!live) return;
    const rows = await runChart(conn, {
      ...base,
      select: [{ aggFn: 'count', valueExpression: '' }],
      where:
        "SpanAttributes['a b-c'] = 'x' AND SpanAttributes['it''s'] = 'quoted'",
    });
    expect(Number(rows[0]['count()'])).toBe(1);
  });

  it('projects map keys in a search column list', async () => {
    if (!live) return;
    const q = await renderChartConfigCouchbase(
      {
        ...base,
        select: "Timestamp, SpanAttributes['http.route']",
        where: "SpanAttributes['http.method'] = 'POST'",
      } as never,
      { getColumns: async () => [] },
      undefined,
    );
    expect(q.sql).toContain('SpanAttributes.`http.route`');
    const rows = await runChart(conn, {
      ...base,
      select: "Timestamp, SpanAttributes['http.route']",
      where: "SpanAttributes['http.method'] = 'POST'",
    });
    expect(rows.map(r => r["SpanAttributes['http.route']"])).toEqual([
      '/users',
    ]);
  });

  // Kubernetes filters list values for `ResourceAttributes['k8s.pod.name']`.
  it('lists dropdown values for a map key in subscript form', async () => {
    if (!live) return;
    const metadata = new Metadata(
      new CouchbaseNodeClient({ conn, team: null }),
      new MetadataCache(),
    );
    const [values] = await metadata.getKeyValues({
      chartConfig: {
        connection: 'd9-live',
        from: base.from,
        dateRange: base.dateRange as [Date, Date],
        timestampValueExpression: 'Timestamp',
      },
      keys: ["ResourceAttributes['k8s.pod.name']"],
    });
    expect([...values.value].sort()).toEqual(['pod-a', 'pod-b']);
  });
});
