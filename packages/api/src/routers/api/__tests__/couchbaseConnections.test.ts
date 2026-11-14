import express from 'express';
import request from 'supertest';

const mockGetConnectionById = jest.fn();
const mockUpdateConnection = jest.fn();
const mockDeleteConnection = jest.fn();
const mockCreateConnection = jest.fn();
const mockInvalidate = jest.fn();

jest.mock('@couchbase-traces/common-utils/dist/couchbase/node', () => ({
  clusterCache: {
    invalidate: (...args: unknown[]) => mockInvalidate(...args),
    closeAll: jest.fn(),
  },
}));

jest.mock('@/controllers/connection', () => ({
  ...jest.requireActual('@/controllers/connection'),
  getConnectionById: (...args: unknown[]) => mockGetConnectionById(...args),
  updateConnection: (...args: unknown[]) => mockUpdateConnection(...args),
  deleteConnection: (...args: unknown[]) => mockDeleteConnection(...args),
  createConnection: (...args: unknown[]) => mockCreateConnection(...args),
  validateConnectionId: jest.fn().mockResolvedValue({ ok: true }),
}));

import connectionsRouter from '@/routers/api/connections';

const TEAM_ID = '65f0a0a0a0a0a0a0a0a0a0a0';
const CONNECTION_ID = '65f0b0b0b0b0b0b0b0b0b0b0';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // @ts-expect-error minimal user for team scoping
    req.user = { _id: 'user', email: 'u@example.com', team: TEAM_ID };
    next();
  });
  app.use('/connections', connectionsRouter);
  return app;
}

const storedCouchbase = {
  id: CONNECTION_ID,
  kind: 'couchbase',
  name: 'cb',
  host: 'couchbase://cb.example.com',
  username: 'reader',
  password: 'stored-password',
  tlsCaCertificate: 'stored-pem',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUpdateConnection.mockResolvedValue({ id: CONNECTION_ID });
});

describe('connections router', () => {
  const putBody = {
    id: CONNECTION_ID,
    kind: 'couchbase',
    name: 'cb renamed',
    host: 'couchbase://cb.example.com',
    username: 'reader',
  };

  it('keeps stored secrets when omitted and invalidates the cluster', async () => {
    mockGetConnectionById.mockResolvedValue(storedCouchbase);
    const res = await request(makeApp())
      .put(`/connections/${CONNECTION_ID}`)
      .send(putBody);
    expect(res.status).toBe(200);
    const update = mockUpdateConnection.mock.calls[0][2];
    expect(update.password).toBe('stored-password');
    expect(update).not.toHaveProperty('tlsCaCertificate');
    expect(mockInvalidate).toHaveBeenCalledWith(CONNECTION_ID);
  });

  it('rejects updates to unsupported ClickHouse connections', async () => {
    mockGetConnectionById.mockResolvedValue({
      id: CONNECTION_ID,
      kind: 'clickhouse',
      unsupported: true,
      name: 'legacy',
    });
    const res = await request(makeApp())
      .put(`/connections/${CONNECTION_ID}`)
      .send(putBody);
    expect(res.status).toBe(400);
    expect(mockUpdateConnection).not.toHaveBeenCalled();
  });
});
