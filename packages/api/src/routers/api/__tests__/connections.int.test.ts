import { getLoggedInAgent, getServer } from '@/fixtures';
import { newId } from '@/metadata/ids';
import {
  countConnections,
  findConnection,
  seedConnection,
} from '@/metadata/testing/seed';
import { TEST_COUCHBASE_CONNECTION } from '@/testCouchbaseConnection';

describe('connections router', () => {
  const server = getServer();

  beforeAll(async () => {
    await server.start();
  });

  afterEach(async () => {
    await server.clearDBs();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('only returns connections belonging to the current team through GET /connections', async () => {
    const { agent, team } = await getLoggedInAgent(server);

    await seedConnection({
      kind: 'couchbase',
      team: team._id,
      name: 'My Team Connection',
      host: TEST_COUCHBASE_CONNECTION.host,
      username: 'default',
      password: '',
    });
    await seedConnection({
      kind: 'couchbase',
      team: newId(),
      name: 'Other Team Connection',
      host: TEST_COUCHBASE_CONNECTION.host,
      username: 'default',
      password: '',
    });

    const res = await agent.get('/connections').expect(200);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe('My Team Connection');
  });

  it('rejects isPrometheusEndpoint through POST /connections', async () => {
    const { agent } = await getLoggedInAgent(server);

    const res = await agent
      .post('/connections')
      .send({
        name: 'Prom-enabled',
        host: 'http://thanos:10902',
        username: '',
        password: '',
        isPrometheusEndpoint: true,
      })
      .expect(400);

    expect(res.body.message).toBe('PromQL sources are no longer supported.');
    expect(await countConnections()).toBe(0);
  });

  it('rejects isPrometheusEndpoint through PUT /connections/:id', async () => {
    const { agent, team } = await getLoggedInAgent(server);

    const created = await seedConnection({
      kind: 'couchbase',
      team: team._id,
      name: 'No-prom',
      host: TEST_COUCHBASE_CONNECTION.host,
      username: 'default',
      password: '',
    });

    const res = await agent
      .put(`/connections/${created._id.toString()}`)
      .send({
        id: created._id.toString(),
        name: 'No-prom',
        host: 'http://thanos:10902',
        username: '',
        password: '',
        isPrometheusEndpoint: true,
      })
      .expect(400);

    expect(res.body.message).toBe('PromQL sources are no longer supported.');
    const stored = await findConnection(created._id);
    expect(stored?.isPrometheusEndpoint).not.toBe(true);
  });

  it('toggles isPrometheusEndpoint back to false through PUT', async () => {
    const { agent, team } = await getLoggedInAgent(server);

    const created = await seedConnection({
      kind: 'couchbase',
      team: team._id,
      name: 'Prom',
      host: 'http://thanos:10902',
      username: '',
      password: '',
      isPrometheusEndpoint: true,
    });

    await agent
      .put(`/connections/${created._id.toString()}`)
      .send({
        id: created._id.toString(),
        name: 'Prom',
        kind: 'couchbase',
        host: TEST_COUCHBASE_CONNECTION.host,
        username: 'default',
        password: '',
        isPrometheusEndpoint: false,
      })
      .expect(200);

    const stored = await findConnection(created._id);
    expect(stored?.host).toBe(TEST_COUCHBASE_CONNECTION.host);
    expect(stored?.isPrometheusEndpoint).toBe(false);
  });
});
