// Runs against the container from port/couchbase-test (see run.sh there).
import type { CouchbaseConnectionConfig } from '@/couchbase/node';
import {
  ClusterCache,
  clusterCache,
  CouchbaseNodeClient,
  executeQuery,
  testConnection,
  testKeyspace,
} from '@/couchbase/node';
import type { Frame } from '@/couchbase/types';

import { probeLive } from './liveCluster';

const CONNSTR =
  process.env.CBT_TEST_COUCHBASE_CONNSTR || 'couchbase://localhost';
const USER = process.env.CBT_TEST_COUCHBASE_USER || 'cbt_query';
const PASSWORD =
  process.env.CBT_TEST_COUCHBASE_PASSWORD || 'cbt-query-password';

const EVENTS = '`test`.`app`.`events`';

const conn: CouchbaseConnectionConfig = {
  id: 'int-test-connection',
  host: CONNSTR,
  username: USER,
  password: PASSWORD,
  wanProfile: false,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const silentLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

async function collect(frames: AsyncIterable<Frame>): Promise<Frame[]> {
  const out: Frame[] = [];
  for await (const f of frames) out.push(f);
  return out;
}

function run(
  query: string,
  extra: Partial<Parameters<typeof executeQuery>[0]> = {},
) {
  return collect(
    executeQuery({
      conn,
      inputs: { query },
      team: null,
      frameRows: 500,
      logger: silentLogger,
      ...extra,
    }),
  );
}

function errorOf(frames: Frame[]) {
  const err = frames.find(f => f.type === 'error');
  return err?.type === 'error' ? err.error : undefined;
}

let available = false;

beforeAll(async () => {
  available = await probeLive(conn, 'Couchbase integration');
}, 30000);

afterAll(async () => {
  await clusterCache.closeAll();
});

/** `it` that passes with a logged skip notice when the server is unreachable. */
function itLive(name: string, fn: () => Promise<void>, timeout = 30000) {
  it(
    name,
    async () => {
      if (!available) return;
      await fn();
    },
    timeout,
  );
}

describe('Couchbase integration', () => {
  itLive(
    'testConnection succeeds with cbt_query and fails with a wrong password',
    async () => {
      expect(await testConnection(conn, 10000)).toEqual({ success: true });

      const bad = await testConnection(
        { ...conn, password: 'definitely-wrong' },
        10000,
      );
      expect(bad.success).toBe(false);
      if (!bad.success) {
        expect(bad.error.code).toBe('AUTHENTICATION_FAILED');
        expect(bad.error.message).not.toContain('definitely-wrong');
      }
    },
  );

  itLive(
    'testKeyspace returns sample ids, KEYSPACE_NOT_FOUND, and empty sampleKeys',
    async () => {
      const events = await testKeyspace(
        conn,
        { bucket: 'test', scope: 'app', collection: 'events' },
        10000,
      );
      expect(events).toMatchObject({ success: true });
      if (events.success) {
        expect(events.sampleKeys).toHaveLength(3);
        for (const id of events.sampleKeys) expect(id).toMatch(/^event::\d+$/);
      }

      const missing = await testKeyspace(
        conn,
        { bucket: 'test', scope: 'app', collection: 'no_such_collection' },
        10000,
      );
      expect(missing.success).toBe(false);
      if (!missing.success)
        expect(missing.error.code).toBe('KEYSPACE_NOT_FOUND');

      const empty = await testKeyspace(
        conn,
        { bucket: 'test', scope: 'app', collection: 'metrics_gauge' },
        10000,
      );
      expect(empty).toEqual({ success: true, sampleKeys: [] });
    },
  );

  itLive(
    'SELECT with named parameters returns fixture rows with inferred meta',
    async () => {
      const client = new CouchbaseNodeClient({ conn, logger: silentLogger });
      const rs = await client.query({
        query: `SELECT e.ts, e.\`level\`, e.service, e.message, e.attrs FROM ${EVENTS} AS e
        WHERE e.ts >= $since AND e.\`level\` = $lvl ORDER BY e.ts DESC LIMIT 5`,
        query_params: { since: '2026-01-01T00:00:00.000Z', lvl: 'error' },
        format: 'JSON',
      });
      const result = await rs.json<Record<string, unknown>>();
      await client.close();

      expect(result.data).toHaveLength(5);
      for (const row of result.data) {
        expect(row.level).toBe('error');
        expect(String(row.message)).toMatch(/^fixture message \d+$/);
      }
      const types = Object.fromEntries(
        (result.meta ?? []).map(m => [m.name, m.type]),
      );
      expect(types.ts).toBe("DateTime64(9, 'UTC')");
      expect(types.level).toBe('String');
      expect(types.attrs).toBe('Map(String, String)');
    },
  );

  itLive('INFER on test.app.events succeeds', async () => {
    const frames = await run(`INFER ${EVENTS} WITH {"sample_size": 100}`);
    expect(errorOf(frames)).toBeUndefined();
    const end = frames.at(-1);
    expect(end?.type).toBe('end');
    if (end?.type === 'end') expect(end.rows).toBeGreaterThan(0);
  });

  itLive(
    'the server rejects writes through readOnly even without the statement check',
    async () => {
      const frames = await run(
        `UPSERT INTO ${EVENTS} (KEY, VALUE) VALUES ("readonly::probe", {"ts": "2026-01-01T00:00:00.000Z"})`,
        { skipStatementCheck: true },
      );
      const err = errorOf(frames);
      expect(err).toBeDefined();
      expect(err?.message).toMatch(/read.?only/i);

      const check = await run(
        `SELECT RAW META(d).id FROM ${EVENTS} AS d USE KEYS "readonly::probe"`,
      );
      const rows = check.flatMap(f => (f.type === 'rows' ? f.rows : []));
      expect(rows).toHaveLength(0);
    },
  );

  itLive('a bucket without a query role yields PERMISSION_DENIED', async () => {
    const frames = await run(
      'SELECT * FROM `restricted`.`_default`.`_default` LIMIT 1',
    );
    expect(errorOf(frames)).toMatchObject({ code: 'PERMISSION_DENIED' });
  });

  itLive('a 1 ms timeout yields TIMEOUT', async () => {
    const frames = await collect(
      executeQuery({
        conn,
        inputs: {
          query:
            'SELECT RAW COUNT(*) FROM ARRAY_RANGE(0, 1000) AS a UNNEST ARRAY_RANGE(0, 1000) AS b',
          timeoutMs: 1,
        },
        team: null,
        frameRows: 500,
        logger: silentLogger,
      }),
    );
    expect(errorOf(frames)).toMatchObject({ code: 'TIMEOUT' });
  });

  itLive('streams 1,000 rows as 10 frames of 100', async () => {
    const previous = process.env.CBT_COUCHBASE_FRAME_ROWS;
    process.env.CBT_COUCHBASE_FRAME_ROWS = '100';
    try {
      const frames = await run(
        `SELECT e.ts, e.\`level\` FROM ${EVENTS} AS e WHERE e.ts IS NOT MISSING`,
        { frameRows: Number(process.env.CBT_COUCHBASE_FRAME_ROWS) },
      );
      expect(errorOf(frames)).toBeUndefined();
      const rowFrames = frames.filter(f => f.type === 'rows');
      expect(rowFrames).toHaveLength(10);
      for (const f of rowFrames) {
        if (f.type === 'rows') expect(f.rows).toHaveLength(100);
      }
      const end = frames.at(-1);
      expect(end?.type === 'end' ? end.rows : -1).toBe(1000);
    } finally {
      if (previous == null) delete process.env.CBT_COUCHBASE_FRAME_ROWS;
      else process.env.CBT_COUCHBASE_FRAME_ROWS = previous;
    }
  });

  itLive(
    'the cluster cache reuses a cluster and reconnects after an update',
    async () => {
      const cache = new ClusterCache({
        maxClusters: 5,
        idleMs: 60000,
        connectTimeoutMs: 10000,
        logger: silentLogger,
      });
      try {
        const first = await cache.get(conn);
        await run('SELECT RAW 1', { cache });
        await run('SELECT RAW 2', { cache });
        expect(await cache.get(conn)).toBe(first);
        expect(cache.size).toBe(1);

        const updated = { ...conn, updatedAt: '2026-02-01T00:00:00.000Z' };
        await cache.invalidate(conn.id);
        const second = await cache.get(updated);
        expect(second).not.toBe(first);

        const frames = await collect(
          executeQuery({
            conn: updated,
            inputs: { query: 'SELECT RAW 42' },
            team: null,
            frameRows: 500,
            logger: silentLogger,
            cache,
          }),
        );
        const rows = frames.flatMap(f => (f.type === 'rows' ? f.rows : []));
        expect(rows).toHaveLength(1);
        expect(Object.values(rows[0] ?? {})).toEqual([42]);
        expect(cache.size).toBe(1);
      } finally {
        await cache.closeAll();
      }
    },
  );
});
