// C0 wire-contract snapshots, internal API (docs/the store-elimination-plan.md,
// C0). Captured on the store stack; every later phase must keep them green,
// apart from the documented `__v` removal. Ids, dates, and secrets are
// normalized (metadata/testing/wire.ts), so snapshots are backend neutral.
import { getServer } from '@/fixtures';
import { createWireNormalizer } from '@/metadata/testing/wire';

import {
  type ContractWorld,
  seedContractWorld,
} from './metadataContractsWorld';

describe('metadata wire contracts: internal API', () => {
  const server = getServer();
  let world: ContractWorld;
  let normalize: ReturnType<typeof createWireNormalizer>;

  beforeAll(async () => {
    await server.start();
  });

  beforeEach(async () => {
    world = await seedContractWorld(server);
    normalize = createWireNormalizer();
    // Pin placeholder numbering to seed order, independent of route output.
    normalize([world.teamId, world.userId, Object.values(world.ids)]);
  });

  afterEach(async () => {
    await server.clearDBs();
  });

  afterAll(async () => {
    await server.stop();
  });

  const get = async (path: string) => {
    const res = await world.agent.get(path).expect(200);
    return normalize(res.body);
  };

  it('create responses', () => {
    expect(normalize(world.created)).toMatchSnapshot();
  });

  it.each([
    '/me',
    '/team',
    '/team/members',
    '/team/invitations',
    '/team/tags',
    '/connections',
    '/sources',
    '/webhooks?service=slack',
    '/saved-search',
    '/dashboards',
    '/alerts',
    '/favorites',
  ])('GET %s', async path => {
    expect(await get(path)).toMatchSnapshot();
  });

  it('GET /pinned-filters', async () => {
    expect(
      await get(`/pinned-filters?source=${world.ids.source}`),
    ).toMatchSnapshot();
  });

  it('PATCH /dashboards/:id', async () => {
    const res = await world.agent
      .patch(`/dashboards/${world.ids.dashboard}`)
      .send({ name: 'Contract dashboard renamed' })
      .expect(200);
    expect(normalize(res.body)).toMatchSnapshot();
  });

  it('PATCH /saved-search/:id', async () => {
    const res = await world.agent
      .patch(`/saved-search/${world.ids.savedSearch}`)
      .send({ name: 'Contract warnings' })
      .expect(200);
    expect(normalize(res.body)).toMatchSnapshot();
  });

  it('PUT /alerts/:id', async () => {
    const res = await world.agent
      .put(`/alerts/${world.ids.savedSearchAlert}`)
      .send({
        channel: { type: 'webhook', webhookId: world.ids.webhook },
        interval: '1h',
        threshold: 3,
        thresholdType: 'above',
        source: 'saved_search',
        savedSearchId: world.ids.savedSearch,
      })
      .expect(200);
    expect(normalize(res.body)).toMatchSnapshot();
  });
});
