/**
 * Phase 7a: crafted exponential-histogram points vs reference implementation.
 * Requires port/couchbase-test (CBT_TEST_COUCHBASE_*).
 */
import type { CouchbaseConnectionConfig } from '@/couchbase/node';
import {
  clusterCache,
  CouchbaseNodeClient,
  testConnection,
} from '@/couchbase/node';
import {
  type ExpHistPoint,
  referenceExpHistogramCount,
  referenceExpHistogramQuantile,
} from '@/couchbase/render/metrics/__tests__/expHistogramReference';
import { translateExponentialHistogramCouchbase } from '@/couchbase/render/metrics/expHistogram';
import { quoteIdent } from '@/couchbase/sqlpp';

const CONNSTR =
  process.env.CBT_TEST_COUCHBASE_CONNSTR || 'couchbase://localhost';
const REQUIRED = process.env.CBT_TEST_COUCHBASE_REQUIRED === '1';
const ADMIN_USER = process.env.CBT_TEST_COUCHBASE_ADMIN_USER || 'Administrator';
const ADMIN_PASSWORD =
  process.env.CBT_TEST_COUCHBASE_ADMIN_PASSWORD || 'cbt-test-admin';

const adminConn: CouchbaseConnectionConfig = {
  id: 'exp-hist-admin',
  host: CONNSTR,
  username: ADMIN_USER,
  password: ADMIN_PASSWORD,
  wanProfile: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const KS = '`test`.`app`.`otel_metrics_exponential_histogram`';
const COLLECTION = 'otel_metrics_exponential_histogram';

let live = false;

beforeAll(async () => {
  const probe = await testConnection(adminConn, 15000);
  live = probe.success;
  if (!live) {
    const reason = probe.success ? '' : probe.error.message;
    const msg = `Couchbase integration tests skipped: ${reason}`;
    if (REQUIRED) throw new Error(msg);
    console.warn(msg);
    return;
  }
  // DDL against a just-initialized cluster can 12003 until the query
  // service sees the scope; retry before failing the suite.
  let created = false;
  for (let i = 0; i < 30; i++) {
    try {
      await adminMutate(
        `CREATE COLLECTION \`test\`.\`app\`.\`${COLLECTION}\` IF NOT EXISTS`,
      );
      created = true;
      break;
    } catch (err) {
      if (i === 29) throw err;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  if (!created) {
    throw new Error(`failed to ensure collection ${COLLECTION}`);
  }
  await adminMutate(`CREATE PRIMARY INDEX IF NOT EXISTS ON ${KS}`);
  for (let i = 0; i < 30; i++) {
    try {
      await adminQuery(`SELECT RAW COUNT(*) FROM ${KS}`);
      break;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
}, 90000);

afterAll(async () => {
  await clusterCache.closeAll();
});

function queryHttpPort(): number {
  const offset = Number(process.env.CBT_TEST_COUCHBASE_PORT_OFFSET || 0);
  return 8093 + offset;
}

/** Mutations bypass CouchbaseNodeClient's read-only gate via the query HTTP API. */
async function adminMutate(statement: string, named?: Record<string, unknown>) {
  const payload: Record<string, unknown> = { statement };
  if (named) {
    for (const [k, v] of Object.entries(named)) {
      payload[`$${k}`] = v;
    }
  }
  const auth = Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`).toString(
    'base64',
  );
  const res = await fetch(`http://127.0.0.1:${queryHttpPort()}/query/service`, {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = (await res.json()) as {
    status?: string;
    errors?: unknown;
    results?: unknown[];
  };
  if (body.status !== 'success') {
    throw new Error(`mutate failed: ${JSON.stringify(body.errors || body)}`);
  }
  return body.results ?? [];
}

async function adminQuery(
  statement: string,
  parameters?: Record<string, unknown>,
) {
  const result = await new CouchbaseNodeClient({
    conn: adminConn,
    team: null,
  }).query({
    query: statement,
    query_params: parameters,
    format: 'JSON',
    queryContext: { bucket: 'test', scope: 'app' },
  });
  return (await result.json<{ value?: unknown }>()).data;
}

async function loadPoints(points: ExpHistPoint[], prefix: string) {
  // Prefer USE KEYS deletes — primary-scan DELETE can miss freshly upserted rows.
  const existing = await adminMutate(`SELECT RAW META().id FROM ${KS}`);
  const ids = (existing as string[]).filter(Boolean);
  if (ids.length) {
    await adminMutate(`DELETE FROM ${KS} USE KEYS $ids`, { ids });
  }
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const doc = {
      MetricName: p.MetricName,
      TimeUnix: new Date(p.TimeUnix).toISOString(),
      StartTimeUnix: new Date(p.StartTimeUnix).toISOString(),
      AggregationTemporality: p.AggregationTemporality,
      Scale: p.Scale,
      ZeroCount: p.ZeroCount,
      PositiveOffset: p.PositiveOffset,
      PositiveBucketCounts: p.PositiveBucketCounts,
      NegativeOffset: p.NegativeOffset,
      NegativeBucketCounts: p.NegativeBucketCounts,
      Count: p.Count,
      Attributes: { series: p.seriesKey },
      ResourceAttributes: p.group ? { 'service.name': String(p.group) } : {},
      ScopeAttributes: {},
      ServiceName: p.group ? String(p.group) : 'api',
    };
    await adminMutate(`UPSERT INTO ${KS} (KEY, VALUE) VALUES ($k, $v)`, {
      k: `${prefix}${i}`,
      v: doc,
    });
  }
  // Primary index is eventually consistent after UPSERT.
  const want = points.length;
  for (let i = 0; i < 40; i++) {
    const counted = await adminMutate(
      `SELECT RAW COUNT(*) FROM ${KS} WHERE MetricName = $m`,
      { m: points[0]!.MetricName },
    );
    if (Number(counted[0]) >= want) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error(`docs for ${points[0]!.MetricName} not visible after upsert`);
}

function runSql(
  metricName: string,
  aggFn: 'count' | 'quantile',
  level: number | undefined,
  opts: { groupBy?: string } = {},
) {
  const translated = translateExponentialHistogramCouchbase({
    chartConfig: {
      from: {
        databaseName: 'test',
        scopeName: 'app',
        tableName: COLLECTION,
      },
      select: [],
      timestampValueExpression: 'TimeUnix',
      connection: 'c',
      ...(opts.groupBy ? { groupBy: opts.groupBy } : {}),
    } as never,
    select: {
      aggFn,
      level,
      alias: 'value',
    },
    table: COLLECTION,
    nameFilter: `MetricName = '${metricName.replace(/'/g, "''")}'`,
    from: {
      databaseName: 'test',
      scopeName: 'app',
      tableName: COLLECTION,
    },
  });
  const withs = translated.with
    .map(w => {
      if (!w.sql) throw new Error(`missing sql for CTE ${w.name}`);
      return `${quoteIdent(w.name)} AS (${w.sql.sql})`;
    })
    .join(',\n');
  const params = Object.assign(
    {},
    ...translated.with.map(w => w.sql?.params ?? {}),
  );
  return {
    sql: `WITH ${withs}\nSELECT m.* FROM metrics AS m`,
    params,
    hasGroup: translated.hasGroup,
  };
}

function rowValue(row: Record<string, unknown>): number {
  if (row.value != null && row.value !== '') return Number(row.value);
  const nested = row.metrics as { value?: unknown } | undefined;
  if (nested?.value != null && nested.value !== '') return Number(nested.value);
  return Number.NaN;
}

function relClose(a: number, b: number, tol = 1e-9) {
  if (a === b) return true;
  const den = Math.max(Math.abs(a), Math.abs(b), 1e-15);
  return Math.abs(a - b) / den <= tol;
}

async function expectMatch(
  points: ExpHistPoint[],
  prefix: string,
  aggFn: 'count' | 'quantile',
  level?: number,
  opts: { groupBy?: string } = {},
) {
  const metricName = `parity.exponential.${prefix}`;
  const named = points.map(p => ({ ...p, MetricName: metricName }));
  await loadPoints(named, prefix);
  const { sql, params, hasGroup } = runSql(metricName, aggFn, level, opts);
  const rows = await adminQuery(sql, params);
  const expected =
    aggFn === 'count'
      ? referenceExpHistogramCount(named)
      : referenceExpHistogramQuantile(named, level!);

  if (hasGroup) {
    const byGroup = new Map<string, number>();
    for (const r of rows as Record<string, unknown>[]) {
      const gRaw = r.group;
      const g = Array.isArray(gRaw) ? gRaw[0] : gRaw;
      byGroup.set(String(g), rowValue(r));
    }
    expect(byGroup.size).toBe(expected.length);
    for (const e of expected) {
      const got = byGroup.get(String(e.group));
      expect(got).toBeDefined();
      if (aggFn === 'count') {
        expect(got).toBe(e.value);
      } else {
        expect(relClose(got!, e.value)).toBe(true);
      }
    }
  } else {
    expect(rows).toHaveLength(expected.length);
    if (expected.length === 0) return;
    const got = rowValue(rows[0] as Record<string, unknown>);
    if (aggFn === 'count') {
      expect(got).toBe(expected[0]!.value);
    } else {
      expect(relClose(got, expected[0]!.value)).toBe(true);
    }
  }
}

const base = (over: Partial<ExpHistPoint> = {}): ExpHistPoint => ({
  MetricName: 'parity.exponential',
  TimeUnix: Date.parse('2026-01-01T00:00:10.000Z'),
  StartTimeUnix: Date.parse('2026-01-01T00:00:00.000Z'),
  AggregationTemporality: 1,
  Scale: 0,
  ZeroCount: 0,
  PositiveOffset: 0,
  PositiveBucketCounts: [1, 2, 4],
  NegativeOffset: 0,
  NegativeBucketCounts: [],
  Count: 7,
  seriesKey: 's1',
  ...over,
});

describe('exp histogram couchbase integration', () => {
  it('1: one series, one point, scale 0, positive only', async () => {
    if (!live) return;
    await expectMatch([base()], 'c1_', 'quantile', 0.5);
  });

  it('2: two series at scales 3 and 1 (normalization)', async () => {
    if (!live) return;
    await expectMatch(
      [
        base({
          seriesKey: 'a',
          Scale: 3,
          PositiveBucketCounts: [1, 1, 1, 1, 1, 1, 1, 1],
          Count: 8,
        }),
        base({
          seriesKey: 'b',
          Scale: 1,
          PositiveBucketCounts: [2, 2],
          Count: 4,
        }),
      ],
      'c2_',
      'quantile',
      0.5,
    );
  });

  it('3: negative offsets with scale shift', async () => {
    if (!live) return;
    await expectMatch(
      [
        base({
          seriesKey: 'a',
          Scale: 2,
          NegativeOffset: -4,
          NegativeBucketCounts: [1, 2, 3, 4],
          PositiveBucketCounts: [],
          Count: 10,
        }),
        base({
          seriesKey: 'b',
          Scale: 0,
          NegativeOffset: -1,
          NegativeBucketCounts: [5],
          PositiveBucketCounts: [],
          Count: 5,
        }),
      ],
      'c3_',
      'quantile',
      0.5,
    );
  });

  it('4: negative-only and both sides with zero count', async () => {
    if (!live) return;
    await expectMatch(
      [
        base({
          ZeroCount: 3,
          NegativeOffset: -2,
          NegativeBucketCounts: [1, 1],
          PositiveOffset: 0,
          PositiveBucketCounts: [2],
          Count: 7,
        }),
      ],
      'c4_',
      'quantile',
      0.5,
    );
  });

  it('5-8: cumulative offset moves, resets, and window drops', async () => {
    if (!live) return;
    const t0 = Date.parse('2026-01-01T00:00:10.000Z');
    const points: ExpHistPoint[] = [
      base({
        AggregationTemporality: 2,
        TimeUnix: t0,
        StartTimeUnix: t0 - 10_000,
        PositiveOffset: 0,
        PositiveBucketCounts: [2, 2],
        Count: 4,
      }),
      base({
        AggregationTemporality: 2,
        TimeUnix: t0 + 1000,
        StartTimeUnix: t0 - 10_000,
        PositiveOffset: 1,
        PositiveBucketCounts: [2, 3],
        Count: 5,
      }),
      base({
        AggregationTemporality: 2,
        TimeUnix: t0 + 2000,
        StartTimeUnix: t0 - 10_000,
        PositiveOffset: 0,
        PositiveBucketCounts: [1, 2, 3],
        Count: 6,
      }),
      // reset by StartTimeUnix
      base({
        AggregationTemporality: 2,
        TimeUnix: t0 + 3000,
        StartTimeUnix: t0 + 2500,
        PositiveOffset: 0,
        PositiveBucketCounts: [4, 4],
        Count: 8,
      }),
      // reset by decreased bucket
      base({
        AggregationTemporality: 2,
        TimeUnix: t0 + 4000,
        StartTimeUnix: t0 + 2500,
        PositiveOffset: 0,
        PositiveBucketCounts: [1, 1],
        Count: 2,
      }),
    ];
    await expectMatch(points, 'c5_', 'quantile', 0.5);
    await expectMatch(points, 'c5c_', 'count');
  });

  it('9: first point and StartTimeUnix = TimeUnix contribute nothing', async () => {
    if (!live) return;
    const t0 = Date.parse('2026-01-01T00:00:10.000Z');
    const points: ExpHistPoint[] = [
      base({
        AggregationTemporality: 2,
        TimeUnix: t0,
        StartTimeUnix: t0,
        Count: 10,
        PositiveBucketCounts: [5, 5],
      }),
      base({
        AggregationTemporality: 2,
        TimeUnix: t0 + 1000,
        StartTimeUnix: t0 - 5000,
        Count: 10,
        PositiveBucketCounts: [5, 5],
      }),
    ];
    await expectMatch(points, 'c9_', 'count');
  });

  it('10: delta and mixed delta/cumulative', async () => {
    if (!live) return;
    await expectMatch(
      [
        base({ AggregationTemporality: 1, seriesKey: 'd', Count: 7 }),
        base({
          AggregationTemporality: 2,
          seriesKey: 'c',
          TimeUnix: Date.parse('2026-01-01T00:00:10.000Z'),
          StartTimeUnix: Date.parse('2026-01-01T00:00:00.000Z'),
          Count: 3,
          PositiveBucketCounts: [1, 2],
        }),
        base({
          AggregationTemporality: 2,
          seriesKey: 'c',
          TimeUnix: Date.parse('2026-01-01T00:00:11.000Z'),
          StartTimeUnix: Date.parse('2026-01-01T00:00:00.000Z'),
          Count: 5,
          PositiveBucketCounts: [2, 3],
        }),
      ],
      'c10_',
      'count',
    );
  });

  it('11-12: quantiles 0, 0.5, 0.9, 0.99, 1 and boundary rank', async () => {
    if (!live) return;
    const p = [base()];
    for (const level of [0, 0.5, 0.9, 0.99, 1]) {
      await expectMatch(p, `c11_${level}_`, 'quantile', level);
    }
  });

  it('13: all-zero counts drop the row', async () => {
    if (!live) return;
    await expectMatch(
      [
        base({
          ZeroCount: 0,
          PositiveBucketCounts: [0, 0],
          Count: 0,
        }),
      ],
      'c13_',
      'quantile',
      0.5,
    );
  });

  it('14: group by resource attribute with two groups', async () => {
    if (!live) return;
    await expectMatch(
      [
        base({ group: 'api', seriesKey: 'a', Count: 7 }),
        base({
          group: 'web',
          seriesKey: 'b',
          PositiveBucketCounts: [2, 2, 2],
          Count: 6,
        }),
      ],
      'c14_',
      'quantile',
      0.5,
      { groupBy: 'ServiceName' },
    );
  });

  it('16: 160 buckets × 200 points completes; EXPLAIN uses name', async () => {
    if (!live) return;
    const buckets = Array.from({ length: 160 }, (_, i) => (i % 5) + 1);
    const points: ExpHistPoint[] = [];
    const t0 = Date.parse('2026-01-01T00:00:00.000Z');
    for (let i = 0; i < 200; i++) {
      points.push(
        base({
          TimeUnix: t0 + i * 1000,
          PositiveBucketCounts: buckets,
          Count: buckets.reduce((a, b) => a + b, 0),
          seriesKey: 'wide',
        }),
      );
    }
    const metricName = 'parity.exponential.c16_';
    const named = points.map(p => ({ ...p, MetricName: metricName }));
    await loadPoints(named, 'c16_');
    const { sql, params } = runSql(metricName, 'quantile', 0.95);
    const start = Date.now();
    const rows = await adminQuery(sql, params);
    expect(Date.now() - start).toBeLessThan(60_000);
    expect(rows.length).toBeGreaterThan(0);
    const plan = await adminQuery(`EXPLAIN ${sql}`, params);
    expect(JSON.stringify(plan)).toContain(COLLECTION);
  }, 120000);
});
