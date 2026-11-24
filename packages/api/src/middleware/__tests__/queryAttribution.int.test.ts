import { SourceKind } from '@couchbase-traces/common-utils/dist/types';

import {
  DEFAULT_DATABASE,
  DEFAULT_LOGS_TABLE,
  getLoggedInAgent,
  getServer,
} from '@/fixtures';
import {
  type CompletedRequest,
  findCompletedRequests,
  purgeCompletedRequests,
  setCompletedThreshold,
} from '@/fixtureStore';
import { seedConnection, seedSource } from '@/metadata/testing/seed';
import { TEST_COUCHBASE_CONNECTION } from '@/testCouchbaseConnection';

// Covers the wiring the unit tests can't: auth middleware opens the
// AsyncLocalStorage scope, and a query issued deep inside the route handler
// still reads it. If that scope is lost, queries fall back to hdx-unknown-*.
//
// Ported from upstream's ClickHouse `system.query_log` suite (D29). The tag
// travels as the SQL++ client_context_id (upstream `query_id`) and a trailing
// block comment on the statement (upstream `log_comment`), both kept by
// `system:completed_requests`. Upstream's three cases ran over PromQL routes,
// which are dropped; the same assertions run on an external chart (route
// scope) and on `/couchbase/query` (browser attribution).
describe('request query attribution', () => {
  const server = getServer();
  let previousThreshold = 1000;

  beforeAll(async () => {
    await server.start();
    // Completed requests faster than the threshold (1000 ms default) are
    // not recorded; log everything for the length of this suite.
    previousThreshold = await setCompletedThreshold(0);
  });

  beforeEach(async () => {
    await purgeCompletedRequests();
  });

  afterEach(async () => {
    await server.clearDBs();
  });

  afterAll(async () => {
    await setCompletedThreshold(previousThreshold);
    await server.stop();
  });

  /** The JSON in the trailing attribution comment. */
  function commentOf(row: CompletedRequest): Record<string, unknown> {
    const m = /\n\/\* (\{.*\}) \*\/$/.exec(row.statement);
    if (!m) throw new Error(`no attribution comment: ${row.statement}`);
    return JSON.parse(m[1]);
  }

  // Requests are recorded as they complete, so poll.
  async function findRouteQueries(pattern: string) {
    for (let attempt = 0; attempt < 20; attempt++) {
      const rows = await findCompletedRequests(pattern);
      if (rows.length > 0) return rows;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    return [];
  }

  async function seedLogs() {
    const { agent, team, user } = await getLoggedInAgent(server);
    const conn = await seedConnection({
      kind: 'couchbase',
      team: team._id,
      name: 'Default',
      host: TEST_COUCHBASE_CONNECTION.host,
      username: TEST_COUCHBASE_CONNECTION.username,
      password: TEST_COUCHBASE_CONNECTION.password,
    });
    const source = await seedSource({
      kind: SourceKind.Log,
      team: team._id,
      connection: conn._id,
      name: 'Logs',
      from: { databaseName: DEFAULT_DATABASE, tableName: DEFAULT_LOGS_TABLE },
      timestampValueExpression: 'Timestamp',
    });
    return { agent, user, conn, source };
  }

  it('tags queries from an authenticated route with the api surface', async () => {
    const { agent, user, source } = await seedLogs();
    const endTime = Date.now();

    await agent
      .post('/api/v2/charts/series')
      .set('Authorization', `Bearer ${user.accessKey}`)
      .send({
        startTime: endTime - 3600_000,
        endTime,
        series: [
          {
            sourceId: source._id.toString(),
            dataSource: 'events',
            aggFn: 'count',
            where: '',
            groupBy: [],
          },
        ],
      })
      .expect(200);

    const logged = await findRouteQueries(
      `%${DEFAULT_LOGS_TABLE}%"label":"/api/v2/charts"%`,
    );
    expect(logged.length).toBeGreaterThan(0);
    for (const row of logged) {
      expect(row.clientContextID).toMatch(/^hdx-api-/);
      expect(commentOf(row)).toMatchObject({
        surface: 'api',
        label: '/api/v2/charts',
      });
    }
  });

  it('tags /couchbase/query with the attribution the browser sent', async () => {
    const { agent, conn } = await seedLogs();
    const tile = `tile-${Date.now()}`;

    await agent
      .post('/couchbase/query')
      .send({
        connectionId: conn._id.toString(),
        statement: `SELECT RAW ${JSON.stringify(tile)}`,
        attribution: {
          surface: 'dashboard',
          dashboard: 'dash-1',
          tile,
          label: 'from-browser',
          trace: 'from-browser',
        },
      })
      .expect(200);

    const logged = await findRouteQueries(`%"tile":"${tile}"%`);

    expect(logged).toHaveLength(1);
    expect(logged[0].clientContextID).toMatch(/^hdx-dashboard-/);
    expect(commentOf(logged[0])).toMatchObject({
      surface: 'dashboard',
      dashboard: 'dash-1',
      tile,
      // The server's, not the browser's.
      label: '/couchbase',
    });
    expect(commentOf(logged[0]).trace).not.toBe('from-browser');
  });

  it('sanitizes browser attribution before it reaches the statement', async () => {
    const { agent, conn } = await seedLogs();
    const marker = `m${Date.now()}`;

    await agent
      .post('/couchbase/query')
      .send({
        connectionId: conn._id.toString(),
        statement: `SELECT RAW ${JSON.stringify(marker)}`,
        attribution: {
          surface: 'search',
          search: `${marker} */ DELETE FROM x /* "q" \\ é`,
          // Not an attribution key: dropped, never recorded.
          email: 'someone@example.com',
        },
        queryId: 'caller/"id"',
      })
      .expect(200);

    const logged = await findRouteQueries(`%${marker}%"search"%`);

    expect(logged).toHaveLength(1);
    const comment = commentOf(logged[0]);
    expect(comment.search).toBe(`${marker} / DELETE FROM x / q`);
    expect(comment).not.toHaveProperty('email');
    expect(logged[0].statement).not.toContain('example.com');
    // The statement's only comment terminator is the one we appended.
    expect(logged[0].statement.indexOf('*/')).toBe(
      logged[0].statement.length - 2,
    );
    // Couchbase rejects `/` and `"` in a client context id (error 1110).
    expect(logged[0].clientContextID).toBe('callerid');
  });

  // Not in upstream: the comment is appended to the caller's text, so a
  // trailing `;` or `--` comment must still parse.
  it('keeps statements ending in a semicolon or line comment valid', async () => {
    const { agent, conn } = await seedLogs();
    const marker = `t${Date.now()}`;

    const res = await agent
      .post('/couchbase/query')
      .send({
        connectionId: conn._id.toString(),
        statement: `SELECT RAW ${JSON.stringify(marker)}; -- trailing`,
        attribution: { surface: 'search', search: marker },
      })
      .expect(200);

    expect(res.text).toContain(marker);
    expect(res.text).not.toContain('"type":"error"');
    const logged = await findRouteQueries(`%${marker}%"search"%`);
    expect(logged).toHaveLength(1);
    expect(commentOf(logged[0])).toMatchObject({ search: marker });
  });
});
