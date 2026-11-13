import { histogramQuantile, quantile } from '@/couchbase/fn/quantile';
import { count, uniq } from '@/couchbase/fn/scalar';
import type { CouchbaseConnectionConfig } from '@/couchbase/node';
import {
  clusterCache,
  CouchbaseNodeClient,
  testConnection,
} from '@/couchbase/node';
import { CouchbaseSearchBuilder } from '@/couchbase/serializer';
import { sqlpp } from '@/couchbase/sqlpp';
import { parseGranularity, timeBucketExpr } from '@/couchbase/time';

const CONNSTR =
  process.env.CBT_TEST_COUCHBASE_CONNSTR || 'couchbase://localhost';
const REQUIRED = process.env.CBT_TEST_COUCHBASE_REQUIRED === '1';
const conn: CouchbaseConnectionConfig = {
  id: 'phase6',
  host: CONNSTR,
  username: process.env.CBT_TEST_COUCHBASE_USER || 'cbt_query',
  password: process.env.CBT_TEST_COUCHBASE_PASSWORD || 'cbt-query-password',
  wanProfile: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

let live = false;

beforeAll(async () => {
  const probe = await testConnection(conn, 15000);
  live = probe.success;
  if (!live) {
    const reason = probe.success ? '' : probe.error.message;
    const msg = `Couchbase integration tests skipped: ${reason}`;
    if (REQUIRED) throw new Error(msg);
    console.warn(msg);
  }
}, 30000);

afterAll(async () => {
  await clusterCache.closeAll();
});

function client() {
  return new CouchbaseNodeClient({ conn, team: null });
}

async function rows(statement: string, parameters?: Record<string, unknown>) {
  const result = await client().query({
    query: statement,
    query_params: parameters,
    format: 'JSON',
    queryContext: { bucket: 'test', scope: 'app' },
  });
  const json = await result.json<{ value?: unknown }>();
  return json.data;
}

describe('phase 6 SQL++', () => {
  it('runs lucene predicates, the attribute index, and time buckets', async () => {
    if (!live) return;
    const where = await new CouchbaseSearchBuilder('service:"svc-1"', {
      metadata: {
        getColumns: async () => [
          { name: 'service', type: 'String' },
          { name: 'attrs', type: 'Map(String, String)' },
          { name: 'ts', type: "DateTime64(9, 'UTC')" },
          { name: 'level', type: 'String' },
        ],
      },
      tc: {
        connectionId: 'phase6',
        databaseName: 'test',
        scopeName: 'app',
        tableName: 'events',
      },
      alias: 'd',
    }).build();
    const matched = await rows(
      `SELECT RAW META(d).id FROM \`test\`.\`app\`.\`events\` AS d WHERE ${where.statement} LIMIT 5`,
      where.parameters,
    );
    expect(matched.length).toBeGreaterThan(0);

    const plan = await rows(
      `EXPLAIN SELECT d.service FROM \`test\`.\`app\`.\`events\` AS d WHERE ${where.statement} LIMIT 1`,
      where.parameters,
    );
    expect(JSON.stringify(plan)).toContain('ix_events_service');

    const attr = await new CouchbaseSearchBuilder('attrs.host:"host-1"', {
      metadata: {
        getColumns: async () => [
          { name: 'attrs', type: 'Map(String, String)' },
        ],
      },
      tc: {
        connectionId: 'phase6',
        databaseName: 'test',
        scopeName: 'app',
        tableName: 'events',
      },
      alias: 'd',
    }).build();
    const attrPlan = await rows(
      `EXPLAIN SELECT META(d).id FROM \`test\`.\`app\`.\`events\` AS d WHERE ${attr.statement}`,
      attr.parameters,
    );
    expect(JSON.stringify(attrPlan)).toContain('ix_events_attr_items');

    // MILLIS_TO_UTC omits a zero fraction, so an exact hour is `...00Z`.
    const hour = await firstBucket('1 hour');
    expect(hour).toMatch(/T\d{2}:00:00/);
    expect(hour.endsWith('Z')).toBe(true);
    const minute = await firstBucket('1 minute');
    expect(minute).toMatch(/T\d{2}:\d{2}:00/);
    expect(minute.endsWith('Z')).toBe(true);
    const day = await firstBucket('1 day');
    expect(day).toMatch(/T00:00:00/);
    expect(day.endsWith('Z')).toBe(true);
    expect(await firstBucket('1 week')).toContain('2025-12-29');
    expect(await firstBucket('1 month')).toContain('2026-01');

    const agg = sqlpp`SELECT ${{ Raw: count() }} AS c, ${{ Raw: uniq('d.`level`') }} AS u, ${quantile(0.5, '1')} AS q FROM \`test\`.\`app\`.\`events\` AS d`;
    const summary = await rows(agg.statement, agg.parameters);
    expect(summary.length).toBe(1);

    const hist = histogramQuantile(0.5, '[0, 10, 20]', '[1, 1, 1]');
    const histRows = await rows(
      `SELECT RAW ${hist.statement} FROM \`test\`.\`app\`.\`events\` AS d LIMIT 1`,
      hist.parameters,
    );
    expect(Number(scalar(histRows[0]))).toBeCloseTo(5, 5);

    const roundExpr = await rows(
      'EXPLAIN SELECT ROUND(1/1000000) AS v FROM `test`.`app`.`events` AS d LIMIT 0',
    );
    expect(JSON.stringify(roundExpr).length).toBeGreaterThan(0);
    const scientific = await rows(
      'EXPLAIN SELECT ROUND(1/1e6) AS v FROM `test`.`app`.`events` AS d LIMIT 0',
    );
    expect(JSON.stringify(scientific).length).toBeGreaterThan(0);
  }, 60000);

  async function firstBucket(granularity: string): Promise<string> {
    const bucket = timeBucketExpr(
      'STR_TO_MILLIS(d.ts)',
      'epoch_millis',
      parseGranularity(granularity),
    );
    const found = await rows(
      `SELECT RAW ${bucket.statement} FROM \`test\`.\`app\`.\`events\` AS d LIMIT 1`,
      bucket.parameters,
    );
    // SELECT RAW scalars are wrapped as `{value}` by the node executor.
    const value = scalar(found[0]);
    return typeof value === 'string' ? value : JSON.stringify(value ?? '');
  }

  function scalar(value: unknown): unknown {
    if (value != null && typeof value === 'object' && 'value' in value) {
      return value.value;
    }
    return value;
  }
});
