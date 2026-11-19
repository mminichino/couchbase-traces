import request from 'supertest';

import { getAgent, getServer } from '@/fixtures';
import { getMetadataStore, setMetadataStoreForTests } from '@/metadata';
import opampApp from '@/opamp/app';

// Covers https://github.com/mminichino/couchbase-traces/issues/2966: `/health` is pure
// liveness and must stay 200 while the process serves HTTP, whereas `/ready`
// must reflect the metadata store so Kubernetes readiness probes can pull a
// pod that cannot serve metadata-backed requests out of rotation.
describe('health and readiness endpoints', () => {
  const server = getServer();

  beforeAll(async () => {
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('GET /health returns 200 on the API server', async () => {
    const resp = await getAgent(server).get('/health').expect(200);
    expect(resp.body.data).toEqual('OK');
  });

  it('GET /health returns 200 on the OpAMP server', async () => {
    const resp = await request(opampApp).get('/health').expect(200);
    expect(resp.body).toEqual({ status: 'OK' });
  });

  it('GET /ready reflects the metadata store on both servers', async () => {
    const agent = getAgent(server);

    // Ready: both readiness endpoints pass.
    const apiReady = await agent.get('/ready').expect(200);
    expect(apiReady.body.data).toEqual('OK');
    await request(opampApp).get('/ready').expect(200);

    const store = getMetadataStore();
    setMetadataStoreForTests(null);
    try {
      // Store gone: readiness fails with the metadata state ...
      const apiNotReady = await agent.get('/ready').expect(503);
      expect(apiNotReady.body).toEqual({
        status: 'unavailable',
        metadata: 'disabled',
      });
      const opampNotReady = await request(opampApp).get('/ready').expect(503);
      expect(opampNotReady.body).toEqual({
        status: 'unavailable',
        metadata: 'disabled',
      });

      // ... while liveness stays green — restarting would not fix Couchbase.
      await agent.get('/health').expect(200);
      await request(opampApp).get('/health').expect(200);
    } finally {
      setMetadataStoreForTests(store);
    }

    await agent.get('/ready').expect(200);
    await request(opampApp).get('/ready').expect(200);
  });
});
