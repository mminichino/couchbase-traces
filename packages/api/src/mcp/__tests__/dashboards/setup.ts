import { SourceKind } from '@couchbase-traces/common-utils/dist/types';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

import {
  DEFAULT_DATABASE,
  DEFAULT_TRACES_TABLE,
  getLoggedInAgent,
  getServer,
} from '@/fixtures';
import { createTestClient } from '@/mcp/__tests__/mcpTestUtils';
import { McpContext } from '@/mcp/tools/types';
import { seedConnection, seedSource } from '@/metadata/testing/seed';
import { TEST_COUCHBASE_CONNECTION } from '@/testCouchbaseConnection';

/**
 * Shared setup/teardown for all dashboard MCP tool tests.
 *
 * Usage:
 *   const ctx = setupDashboardTests();
 *   // Then access ctx.team, ctx.traceSource, ctx.connection, ctx.client
 */
export function setupDashboardTests() {
  const server = getServer();
  const ctx = {
    server,
    team: null as any,
    user: null as any,
    traceSource: null as any,
    connection: null as any,
    client: null as Client | null,
    /** Replaces `client` with one whose MCP context has these overrides. */
    reconnect: async (overrides: Partial<McpContext>): Promise<void> => {
      await ctx.client?.close();
      ctx.client = await createTestClient({
        teamId: ctx.team._id.toString(),
        userId: ctx.user._id.toString(),
        ...overrides,
      });
    },
  };

  beforeAll(async () => {
    await server.start();
  });

  beforeEach(async () => {
    const result = await getLoggedInAgent(server);
    ctx.team = result.team;
    ctx.user = result.user;

    ctx.connection = await seedConnection({
      kind: 'couchbase',
      team: ctx.team._id,
      name: 'Default',
      host: TEST_COUCHBASE_CONNECTION.host,
      username: TEST_COUCHBASE_CONNECTION.username,
      password: TEST_COUCHBASE_CONNECTION.password,
    });

    ctx.traceSource = await seedSource({
      kind: SourceKind.Trace,
      team: ctx.team._id,
      from: {
        databaseName: DEFAULT_DATABASE,
        tableName: DEFAULT_TRACES_TABLE,
      },
      timestampValueExpression: 'Timestamp',
      connection: ctx.connection._id,
      name: 'Traces',
    });

    const mcpContext: McpContext = {
      teamId: ctx.team._id.toString(),
      userId: ctx.user._id.toString(),
    };
    ctx.client = await createTestClient(mcpContext);
  });

  afterEach(async () => {
    await ctx.client?.close();
    await server.clearDBs();
  });

  afterAll(async () => {
    await server.stop();
  });

  return ctx;
}
