import express from 'express';
import request from 'supertest';

const mockGetConnectionById = jest.fn();
const mockUpdateConnection = jest.fn();
const mockDeleteConnection = jest.fn();
const mockCreateConnection = jest.fn();
const mockInvalidate = jest.fn();
const mockCreateSource = jest.fn();

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

jest.mock('@/controllers/sources', () => ({
  ...jest.requireActual('@/controllers/sources'),
  createSource: (...args: unknown[]) => mockCreateSource(...args),
  updateSource: (...args: unknown[]) => mockCreateSource(...args),
}));

import clickhouseProxyRouter from '@/routers/api/clickhouseProxy';
import connectionsRouter from '@/routers/api/connections';
import sourcesRouter from '@/routers/api/sources';

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
  app.use('/clickhouse-proxy', clickhouseProxyRouter);
  app.use('/connections', connectionsRouter);
  app.use('/sources', sourcesRouter);
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

describe('ClickHouse proxy and Couchbase connections', () => {
  it('returns 409 when the connection is Couchbase', async () => {
    mockGetConnectionById.mockResolvedValue(storedCouchbase);
    const res = await request(makeApp())
      .post('/clickhouse-proxy/')
      .set('x-hyperdx-connection-id', CONNECTION_ID)
      .send('SELECT 1');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      success: false,
      error: 'This feature does not support Couchbase connections yet.',
    });
  });

  it('rejects a Couchbase body on the connection test route', async () => {
    const res = await request(makeApp())
      .post('/clickhouse-proxy/test')
      .send({ kind: 'couchbase', host: 'couchbase://cb.example.com' });
    expect(res.status).toBe(409);
  });
});

describe('connections router', () => {
  const putBody = {
    id: CONNECTION_ID,
    kind: 'couchbase',
    name: 'cb renamed',
    host: 'couchbase://cb.example.com',
    username: 'reader',
  };

  it('keeps kind immutable on update', async () => {
    mockGetConnectionById.mockResolvedValue(storedCouchbase);
    const res = await request(makeApp())
      .put(`/connections/${CONNECTION_ID}`)
      .send({ ...putBody, kind: 'clickhouse', host: 'http://ch:8123' });
    expect(res.status).toBe(400);
    expect(mockUpdateConnection).not.toHaveBeenCalled();
  });

  it('treats a stored connection without kind as ClickHouse', async () => {
    mockGetConnectionById.mockResolvedValue({
      ...storedCouchbase,
      kind: undefined,
    });
    const res = await request(makeApp())
      .put(`/connections/${CONNECTION_ID}`)
      .send(putBody);
    expect(res.status).toBe(400);
  });

  it('keeps stored secrets when omitted and invalidates the cluster', async () => {
    mockGetConnectionById.mockResolvedValue(storedCouchbase);
    const res = await request(makeApp())
      .put(`/connections/${CONNECTION_ID}`)
      .send(putBody);
    expect(res.status).toBe(200);
    expect(mockGetConnectionById).toHaveBeenCalledWith(
      TEAM_ID,
      CONNECTION_ID,
      true,
    );
    const update = mockUpdateConnection.mock.calls[0][2];
    expect(update.password).toBe('stored-password');
    // Not in $set, so the stored certificate stays.
    expect(update).not.toHaveProperty('tlsCaCertificate');
    expect(update).not.toHaveProperty('hyperdxSettingPrefix');
    expect(mockInvalidate).toHaveBeenCalledWith(CONNECTION_ID);
  });

  it('writes a new certificate when one is given', async () => {
    mockGetConnectionById.mockResolvedValue(storedCouchbase);
    await request(makeApp())
      .put(`/connections/${CONNECTION_ID}`)
      .send({ ...putBody, password: 'new', tlsCaCertificate: 'new-pem' });
    const update = mockUpdateConnection.mock.calls[0][2];
    expect(update.password).toBe('new');
    expect(update.tlsCaCertificate).toBe('new-pem');
  });

  it('does not invalidate the cluster cache for ClickHouse updates', async () => {
    mockGetConnectionById.mockResolvedValue({
      id: CONNECTION_ID,
      kind: 'clickhouse',
      password: 'x',
    });
    const res = await request(makeApp())
      .put(`/connections/${CONNECTION_ID}`)
      .send({
        id: CONNECTION_ID,
        name: 'ch',
        host: 'http://ch:8123',
        username: 'default',
      });
    expect(res.status).toBe(200);
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it('invalidates the cluster when a Couchbase connection is deleted', async () => {
    mockDeleteConnection.mockResolvedValue(storedCouchbase);
    await request(makeApp()).delete(`/connections/${CONNECTION_ID}`);
    expect(mockInvalidate).toHaveBeenCalledWith(CONNECTION_ID);
  });

  it('rejects a Couchbase connection with an invalid connection string', async () => {
    const res = await request(makeApp()).post('/connections').send({
      kind: 'couchbase',
      name: 'cb',
      host: 'http://cb.example.com',
      username: 'reader',
    });
    expect(res.status).toBe(400);
    expect(mockCreateConnection).not.toHaveBeenCalled();
  });

  it('creates a Couchbase connection with its own fields only', async () => {
    mockCreateConnection.mockResolvedValue({ _id: CONNECTION_ID });
    const res = await request(makeApp()).post('/connections').send({
      kind: 'couchbase',
      name: 'cb',
      host: 'couchbases://cb.example.com',
      username: 'reader',
      password: 'pw',
      wanProfile: false,
      hyperdxSettingPrefix: 'ignored',
      platformProvisioned: true,
    });
    expect(res.status).toBe(200);
    const created = mockCreateConnection.mock.calls[0][1];
    expect(created).toMatchObject({ kind: 'couchbase', wanProfile: false });
    expect(created).not.toHaveProperty('hyperdxSettingPrefix');
    expect(created).not.toHaveProperty('platformProvisioned');
  });
});

describe('sources router', () => {
  const baseSource = {
    kind: 'log',
    name: 'events',
    connection: CONNECTION_ID,
    from: { databaseName: 'test', tableName: 'events' },
    timestampValueExpression: 'ts',
    defaultTableSelectExpression: 'ts',
  };

  beforeEach(() => {
    mockCreateSource.mockResolvedValue({ id: 'new' });
  });

  it('requires scope and timestamp format for a Couchbase source', async () => {
    mockGetConnectionById.mockResolvedValue(storedCouchbase);
    const noScope = await request(makeApp())
      .post('/sources')
      .send({ ...baseSource, timestampFormat: 'iso8601' });
    expect(noScope.status).toBe(400);
    expect(noScope.body.message).toMatch(/Scope/);

    const noFormat = await request(makeApp())
      .post('/sources')
      .send({
        ...baseSource,
        from: { ...baseSource.from, scopeName: 'app' },
      });
    expect(noFormat.status).toBe(400);
    expect(noFormat.body.message).toMatch(/Timestamp format/);
    expect(mockCreateSource).not.toHaveBeenCalled();
  });

  it('accepts a complete Couchbase source', async () => {
    mockGetConnectionById.mockResolvedValue(storedCouchbase);
    const res = await request(makeApp())
      .post('/sources')
      .send({
        ...baseSource,
        from: { ...baseSource.from, scopeName: '_default' },
        timestampFormat: 'epoch_millis',
        searchIndexName: 'events_fts',
        querySettings: [{ setting: 'scan_consistency', value: 'request_plus' }],
      });
    expect(res.status).toBe(200);
    expect(mockCreateSource).toHaveBeenCalled();
  });

  it('rejects an unsupported Couchbase query setting', async () => {
    mockGetConnectionById.mockResolvedValue(storedCouchbase);
    const res = await request(makeApp())
      .post('/sources')
      .send({
        ...baseSource,
        from: { ...baseSource.from, scopeName: 'app' },
        timestampFormat: 'iso8601',
        querySettings: [{ setting: 'max_threads', value: '4' }],
      });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/max_threads/);
  });

  it('rejects Couchbase fields on a ClickHouse source', async () => {
    mockGetConnectionById.mockResolvedValue({ kind: 'clickhouse' });
    const res = await request(makeApp())
      .post('/sources')
      .send({ ...baseSource, timestampFormat: 'iso8601' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/timestampFormat/);
  });

  it('leaves ClickHouse sources unchanged', async () => {
    mockGetConnectionById.mockResolvedValue({ kind: 'clickhouse' });
    const res = await request(makeApp()).post('/sources').send(baseSource);
    expect(res.status).toBe(200);
  });
});
