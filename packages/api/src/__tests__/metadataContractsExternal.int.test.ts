// C0 wire-contract snapshots, external API v2 and MCP tool outputs. See
// metadataContracts.int.test.ts for the conventions.
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { getServer } from '@/fixtures';
import {
  callTool,
  createTestClient,
  getFirstText,
} from '@/mcp/__tests__/mcpTestUtils';
import { createWireNormalizer } from '@/metadata/testing/wire';

import {
  type ContractWorld,
  seedContractWorld,
} from './metadataContractsWorld';

describe('metadata wire contracts: external API v2 and MCP', () => {
  const server = getServer();
  let world: ContractWorld;
  let normalize: ReturnType<typeof createWireNormalizer>;
  let client: Client;

  beforeAll(async () => {
    await server.start();
  });

  beforeEach(async () => {
    world = await seedContractWorld(server);
    normalize = createWireNormalizer();
    normalize([world.teamId, world.userId, Object.values(world.ids)]);
    client = await createTestClient({
      teamId: world.teamId,
      userId: world.userId,
    });
  });

  afterEach(async () => {
    await client?.close();
    await server.clearDBs();
  });

  afterAll(async () => {
    await server.stop();
  });

  const v2 = async (path: string) => {
    const res = await world.agent
      .get(`/api/v2${path}`)
      .set('Authorization', `Bearer ${world.accessKey}`)
      .expect(200);
    return normalize(res.body);
  };

  it.each([
    '/team',
    '/team/members',
    '/team/invitations',
    '/connections',
    '/sources',
    '/webhooks',
    '/saved-searches',
    '/dashboards',
    '/alerts',
  ])('GET /api/v2%s', async path => {
    expect(await v2(path)).toMatchSnapshot();
  });

  it.each([
    ['connections', 'connection'],
    ['sources', 'source'],
    ['saved-searches', 'savedSearch'],
    ['dashboards', 'dashboard'],
    ['alerts', 'tileAlert'],
  ] as const)('GET /api/v2/%s/:id', async (route, key) => {
    const id = new Map(Object.entries(world.ids)).get(key);
    expect(await v2(`/${route}/${id}`)).toMatchSnapshot();
  });

  const mcp = async (name: string, args: Record<string, unknown> = {}) => {
    const result = await callTool(client, name, args);
    expect(result.isError).toBeFalsy();
    const text = getFirstText(result);
    try {
      return normalize(JSON.parse(text));
    } catch {
      return normalize(text);
    }
  };

  it.each([
    ['cbt_list_sources', {}],
    ['cbt_get_webhook', {}],
    ['cbt_get_alert', {}],
    ['cbt_get_saved_search', {}],
    ['cbt_get_dashboard', {}],
    ['cbt_search_dashboards', { tags: ['contract'] }],
  ] as const)('MCP %s', async (name, args) => {
    expect(await mcp(name, args)).toMatchSnapshot();
  });

  it.each([
    ['cbt_get_alert', 'tileAlert'],
    ['cbt_get_saved_search', 'savedSearch'],
    ['cbt_get_dashboard', 'dashboard'],
  ] as const)('MCP %s by id', async (name, key) => {
    const id = new Map(Object.entries(world.ids)).get(key);
    expect(await mcp(name, { id })).toMatchSnapshot();
  });
});
