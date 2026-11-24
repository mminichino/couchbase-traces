import { SourceKind } from '@couchbase-traces/common-utils/dist/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

import {
  DEFAULT_DATABASE,
  getLoggedInAgent,
  getServer,
  getTestFixtureDataClient,
} from '@/fixtures';
import { McpContext } from '@/mcp/tools/types';
import { newId } from '@/metadata/ids';
import { seedConnection, seedSource } from '@/metadata/testing/seed';
import { TEST_COUCHBASE_CONNECTION } from '@/testCouchbaseConnection';

import { callTool, createTestClient, getFirstText } from './mcpTestUtils';

// Upstream creates a ClickHouse database; a Couchbase bucket needs RAM quota
// the CI cluster does not have, so the fixture is a scope of the telemetry
// bucket (database = bucket, table = scope.collection). Upstream's
// events_view is a second collection: SQL++ has no views.
const DATABASE = DEFAULT_DATABASE;
const SCOPE = 'mcp_describe_table_test';
const EVENTS = `${SCOPE}.events`;
const SECOND = `${SCOPE}.events_view`;
const ks = (collection: string) =>
  `\`${DATABASE}\`.\`${SCOPE}\`.\`${collection}\``;

/** DDL right after CREATE COLLECTION can race the collection manifest. */
async function retry(run: () => Promise<void>, attempts = 20): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await run();
      return;
    } catch (e) {
      if (i >= attempts) throw e;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

describe('cbt_describe_table', () => {
  const server = getServer();
  let connection: any;
  let client: Client;

  beforeAll(async () => {
    await server.start();
    const cb = await getTestFixtureDataClient();
    await cb.command({
      query: `DROP SCOPE \`${DATABASE}\`.\`${SCOPE}\` IF EXISTS`,
    });
    await cb.command({
      query: `CREATE SCOPE \`${DATABASE}\`.\`${SCOPE}\``,
    });
    await retry(() =>
      cb.command({ query: `CREATE COLLECTION ${ks('events')}` }),
    );
    await retry(() =>
      cb.command({ query: `CREATE COLLECTION ${ks('events_view')}` }),
    );
    await retry(() =>
      cb.command({ query: `CREATE INDEX idx_body ON ${ks('events')}(Body)` }),
    );
    await retry(() =>
      cb.insert({
        table: `${DATABASE}.${SCOPE}.events`,
        values: [
          {
            Timestamp: '2024-01-01T00:00:00.000000000Z',
            ServiceName: 'api',
            Body: 'a',
          },
          {
            Timestamp: '2024-01-01T00:00:01.000000000Z',
            ServiceName: 'web',
            Body: 'b',
          },
          {
            Timestamp: '2024-01-01T00:00:02.000000000Z',
            ServiceName: 'api',
            Body: 'c',
          },
        ],
        format: 'JSONEachRow',
      }),
    );
  });

  beforeEach(async () => {
    const { team, user } = await getLoggedInAgent(server);
    connection = await seedConnection({
      kind: 'couchbase',
      team: team._id,
      name: 'Default',
      host: TEST_COUCHBASE_CONNECTION.host,
      username: TEST_COUCHBASE_CONNECTION.username,
      password: TEST_COUCHBASE_CONNECTION.password,
    });
    const context: McpContext = {
      teamId: team._id.toString(),
      userId: user._id.toString(),
    };
    client = await createTestClient(context);
  });

  afterEach(async () => {
    await client?.close();
    await server.clearDBs();
  });

  afterAll(async () => {
    const cb = await getTestFixtureDataClient();
    await cb.command({
      query: `DROP SCOPE \`${DATABASE}\`.\`${SCOPE}\` IF EXISTS`,
    });
    await server.stop();
  });

  const call = (args: Record<string, unknown>) =>
    callTool(client, 'cbt_describe_table', {
      connectionId: connection._id.toString(),
      ...args,
    });

  // Q54 (decision pending): upstream also reports engine, sortingKey,
  // primaryKey, partitionKey, the table and column comments, and
  // MATERIALIZED defaults. A collection has none of them; the SQL++
  // equivalents asserted here are the GSI indexes and the document count.
  it('describes columns, indexes, and size of a collection', async () => {
    const result = await call({ database: DATABASE, table: EVENTS });
    expect(result.isError).toBeFalsy();
    const output = JSON.parse(getFirstText(result));

    expect(output.table).toMatchObject({
      database: DATABASE,
      scope: SCOPE,
      name: 'events',
      keyspace: ks('events'),
      approxTotalRows: 3,
    });
    expect(output.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Timestamp' }),
        expect.objectContaining({ name: 'ServiceName', jsType: 'string' }),
        expect.objectContaining({ name: 'Body', jsType: 'string' }),
      ]),
    );
    expect(output.indexes).toEqual([
      { name: 'idx_body', type: 'gsi', expression: '`Body`' },
    ]);
    expect(output.sampleRows).toBeUndefined();
  });

  // Q54 (decision pending): a Distributed table and its local table have no
  // Couchbase counterpart (a collection is already cluster-wide).
  it.skip('reads keys and indices of a Distributed table from its local table', () => {});

  it('reflects an index added after a previous describe', async () => {
    await call({ database: DATABASE, table: EVENTS });
    const cb = await getTestFixtureDataClient();
    await cb.command({
      query: `CREATE INDEX idx_svc ON ${ks('events')}(ServiceName)`,
    });
    try {
      const output = JSON.parse(
        getFirstText(await call({ database: DATABASE, table: EVENTS })),
      );
      expect(output.indexes.map((i: { name: string }) => i.name)).toContain(
        'idx_svc',
      );
    } finally {
      await cb.command({ query: `DROP INDEX idx_svc ON ${ks('events')}` });
    }
  });

  it('points to cbt_describe_source when the table backs a source', async () => {
    const source = await seedSource({
      kind: SourceKind.Log,
      team: connection.team,
      from: { databaseName: DATABASE, scopeName: SCOPE, tableName: 'events' },
      timestampValueExpression: 'Timestamp',
      connection: connection._id,
      name: 'Events',
    });
    const metricSource = await seedSource({
      kind: SourceKind.Metric,
      team: connection.team,
      from: { databaseName: DATABASE, scopeName: SCOPE, tableName: '' },
      metricTables: { gauge: 'events' },
      timestampValueExpression: 'Timestamp',
      resourceAttributesExpression: 'ResourceAttributes',
      connection: connection._id,
      name: 'Event metrics',
    });

    const output = JSON.parse(
      getFirstText(await call({ database: DATABASE, table: EVENTS })),
    );
    expect(output.sources).toEqual(
      expect.arrayContaining([
        { id: source._id.toString(), name: 'Events', kind: SourceKind.Log },
        {
          id: metricSource._id.toString(),
          name: 'Event metrics',
          kind: SourceKind.Metric,
        },
      ]),
    );
    expect(output.nextSteps.describeSource).toMatch(/cbt_describe_source/);
    expect(output.nextSteps.query).toBeUndefined();
    expect(output.columns.length).toBeGreaterThan(0);
  });

  it('does not match a source on another connection', async () => {
    const otherConnection = await seedConnection({
      kind: 'couchbase',
      team: connection.team,
      name: 'Other',
      host: TEST_COUCHBASE_CONNECTION.host,
      username: TEST_COUCHBASE_CONNECTION.username,
      password: TEST_COUCHBASE_CONNECTION.password,
    });
    await seedSource({
      kind: SourceKind.Log,
      team: connection.team,
      from: { databaseName: DATABASE, scopeName: SCOPE, tableName: 'events' },
      timestampValueExpression: 'Timestamp',
      connection: otherConnection._id,
      name: 'Events',
    });

    const output = JSON.parse(
      getFirstText(await call({ database: DATABASE, table: EVENTS })),
    );
    expect(output.sources).toBeUndefined();
    expect(output.nextSteps.query).toMatch(/cbt_save_source/);
  });

  it('returns a capped sample of rows when asked', async () => {
    const result = await call({
      database: DATABASE,
      table: EVENTS,
      sampleRows: 2,
    });
    expect(result.isError).toBeFalsy();
    const output = JSON.parse(getFirstText(result));
    expect(output.sampleRows).toHaveLength(2);
    expect(output.sampleRows[0]).toHaveProperty('ServiceName');
  });

  it('rejects more than 5 sample rows', async () => {
    const result = await call({
      database: DATABASE,
      table: EVENTS,
      sampleRows: 50,
    });
    expect(result.isError).toBe(true);
  });

  // The bucket also holds the OTel collections, so the walk checks that the
  // two fixture collections come one page apart and that paging ends. Q54:
  // upstream's engine and approxTotalRows per listed table are not reported.
  it('lists tables in a database across pages', async () => {
    const names: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 100; page++) {
      const output = JSON.parse(
        getFirstText(
          await call({
            database: DATABASE,
            limit: 1,
            ...(cursor && { cursor }),
          }),
        ),
      );
      expect(output.tables).toHaveLength(1);
      names.push(output.tables[0].name);
      cursor = output.nextCursor;
      if (cursor == null) break;
      expect(cursor).toEqual(expect.any(String));
    }

    expect(cursor).toBeUndefined();
    const at = names.indexOf(EVENTS);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(names[at + 1]).toBe(SECOND);
    expect(new Set(names).size).toBe(names.length);
  });

  it('returns user errors for a missing table or database', async () => {
    const missingTable = await call({
      database: DATABASE,
      table: `${SCOPE}.nope`,
    });
    expect(missingTable.isError).toBe(true);
    expect(getFirstText(missingTable)).toMatch(/not found/);

    const missingDb = await call({ database: 'mcp_no_such_db' });
    expect(missingDb.isError).toBe(true);
    expect(getFirstText(missingDb)).toMatch(/not found/);
  });

  it('treats database and table names as values, not SQL', async () => {
    const result = await call({
      database: DATABASE,
      table: "events' OR '1'='1",
    });
    expect(result.isError).toBe(true);
    expect(getFirstText(result)).toMatch(/not found/);
  });

  it("does not use another team's connection", async () => {
    const otherConnection = await seedConnection({
      kind: 'couchbase',
      team: newId(),
      name: 'Other',
      host: TEST_COUCHBASE_CONNECTION.host,
      username: TEST_COUCHBASE_CONNECTION.username,
      password: TEST_COUCHBASE_CONNECTION.password,
    });
    const result = await callTool(client, 'cbt_describe_table', {
      connectionId: otherConnection._id.toString(),
      database: DATABASE,
    });
    expect(result.isError).toBe(true);
    expect(getFirstText(result)).toMatch(/Connection .* not found/);
  });
});
