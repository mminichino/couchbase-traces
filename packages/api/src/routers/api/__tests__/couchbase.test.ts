import type { Frame } from '@couchbase-traces/common-utils/dist/couchbase/types';
import express from 'express';
import request from 'supertest';

const mockExecuteQuery = jest.fn();
const mockTestConnection = jest.fn();
const mockTestKeyspace = jest.fn();
const mockGetConnectionById = jest.fn();

jest.mock('@couchbase-traces/common-utils/dist/couchbase/node', () => ({
  executeQuery: (...args: unknown[]) => mockExecuteQuery(...args),
  testConnection: (...args: unknown[]) => mockTestConnection(...args),
  testKeyspace: (...args: unknown[]) => mockTestKeyspace(...args),
  setCouchbaseLogger: jest.fn(),
  clusterCache: { invalidate: jest.fn(), closeAll: jest.fn() },
}));

jest.mock('@/controllers/connection', () => ({
  ...jest.requireActual('@/controllers/connection'),
  getConnectionById: (...args: unknown[]) => mockGetConnectionById(...args),
}));

jest.mock('@/controllers/team', () => ({
  ...jest.requireActual('@/controllers/team'),
  getTeam: jest.fn().mockResolvedValue({ queryTimeout: 30 }),
}));

import { isUserAuthenticated } from '@/middleware/auth';
import couchbaseRouter from '@/routers/api/couchbase';

const TEAM_ID = '65f0a0a0a0a0a0a0a0a0a0a0';
const CONNECTION_ID = '65f0b0b0b0b0b0b0b0b0b0b0';

function makeApp({ authenticated = true } = {}) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, { isAuthenticated: () => authenticated });
    if (authenticated) {
      // @ts-expect-error minimal user for team scoping
      req.user = { _id: 'user', email: 'u@example.com', team: TEAM_ID };
    }
    next();
  });
  app.use('/couchbase', isUserAuthenticated, couchbaseRouter);
  return app;
}

const couchbaseConnection = {
  id: CONNECTION_ID,
  kind: 'couchbase',
  host: 'couchbase://cb.example.com',
  username: 'reader',
  password: 'top-secret',
  tlsCaCertificate: '-----BEGIN CERTIFICATE-----secret',
  updatedAt: new Date('2026-11-12T00:00:00Z'),
};

async function* frames(...items: Frame[]) {
  for (const f of items) yield f;
}

const queryBody = {
  connectionId: CONNECTION_ID,
  statement: 'SELECT * FROM `test`.`app`.`events` LIMIT 1',
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('POST /couchbase/query', () => {
  it('requires authentication', async () => {
    const res = await request(makeApp({ authenticated: false }))
      .post('/couchbase/query')
      .send(queryBody);
    expect(res.status).toBe(401);
    expect(mockGetConnectionById).not.toHaveBeenCalled();
  });

  it('looks the connection up within the user team', async () => {
    mockGetConnectionById.mockResolvedValue(null);
    const res = await request(makeApp())
      .post('/couchbase/query')
      .send(queryBody);
    expect(mockGetConnectionById).toHaveBeenCalledWith(
      TEAM_ID,
      CONNECTION_ID,
      true,
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('CONNECTION_NOT_FOUND');
  });

  it('returns 409 for a ClickHouse connection', async () => {
    mockGetConnectionById.mockResolvedValue({
      id: CONNECTION_ID,
      kind: 'clickhouse',
      host: 'http://ch:8123',
    });
    const res = await request(makeApp())
      .post('/couchbase/query')
      .send(queryBody);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WRONG_CONNECTION_KIND');
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  it.each([
    ['DELETE FROM `test`.`app`.`events`', 'STATEMENT_NOT_ALLOWED'],
    ['SELECT 1; SELECT 2', 'MULTIPLE_STATEMENTS'],
  ])('rejects %s with 400', async (statement, code) => {
    mockGetConnectionById.mockResolvedValue(couchbaseConnection);
    const res = await request(makeApp())
      .post('/couchbase/query')
      .send({ ...queryBody, statement });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe(code);
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  it('rejects an invalid body with PARSING_FAILED', async () => {
    const res = await request(makeApp())
      .post('/couchbase/query')
      .send({ connectionId: CONNECTION_ID, format: 'Parquet' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PARSING_FAILED');
  });

  it('streams NDJSON frames with the right headers', async () => {
    mockGetConnectionById.mockResolvedValue(couchbaseConnection);
    mockExecuteQuery.mockReturnValue(
      frames(
        { type: 'meta', meta: [{ name: 'level', type: 'String' }] },
        { type: 'rows', rows: [{ level: 'info' }] },
        {
          type: 'end',
          rows: 1,
          statistics: { elapsed: 0.01, rows_read: 1, bytes_read: 10 },
        },
      ),
    );
    const res = await request(makeApp())
      .post('/couchbase/query')
      .send({ ...queryBody, parameters: { level: 'info' }, format: 'CSV' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe(
      'application/x-ndjson; charset=utf-8',
    );
    expect(res.headers['cache-control']).toBe('no-store');
    const lines = res.text
      .trim()
      .split('\n')
      .map(l => JSON.parse(l));
    expect(lines.map(l => l.type)).toEqual(['meta', 'rows', 'end']);

    const args = mockExecuteQuery.mock.calls[0][0];
    expect(args.inputs.query).toBe(queryBody.statement);
    expect(args.inputs.query_params).toEqual({ level: 'info' });
    expect(args.inputs.format).toBe('CSV');
    expect(args.team).toMatchObject({ queryTimeout: 30 });
    expect(args.conn).toMatchObject({
      id: CONNECTION_ID,
      updatedAt: '2026-11-12T00:00:00.000Z',
    });
    expect(args.skipStatementCheck).toBeUndefined();
  });

  it('maps an error before the first frame to an HTTP status', async () => {
    mockGetConnectionById.mockResolvedValue(couchbaseConnection);
    mockExecuteQuery.mockReturnValue(
      frames({
        type: 'error',
        error: { code: 'TIMEOUT', message: 'timed out', sqlppCode: null },
      }),
    );
    const res = await request(makeApp())
      .post('/couchbase/query')
      .send(queryBody);
    expect(res.status).toBe(504);
    expect(res.body).toEqual({
      success: false,
      error: { code: 'TIMEOUT', message: 'timed out', sqlppCode: null },
    });
  });

  it('sends a mid-stream error as a frame', async () => {
    mockGetConnectionById.mockResolvedValue(couchbaseConnection);
    mockExecuteQuery.mockReturnValue(
      frames(
        { type: 'meta', meta: [] },
        {
          type: 'error',
          error: { code: 'INTERNAL', message: 'boom', sqlppCode: 5000 },
        },
      ),
    );
    const res = await request(makeApp())
      .post('/couchbase/query')
      .send(queryBody);
    expect(res.status).toBe(200);
    const lines = res.text
      .trim()
      .split('\n')
      .map(l => JSON.parse(l));
    expect(lines.at(-1)).toMatchObject({ type: 'error' });
  });

  it('never echoes connection secrets', async () => {
    mockGetConnectionById.mockResolvedValue(couchbaseConnection);
    mockExecuteQuery.mockReturnValue(
      frames(
        { type: 'meta', meta: [] },
        {
          type: 'end',
          rows: 0,
          statistics: { elapsed: 0, rows_read: 0, bytes_read: 0 },
        },
      ),
    );
    const res = await request(makeApp())
      .post('/couchbase/query')
      .send(queryBody);
    expect(res.text).not.toContain('top-secret');
    expect(res.text).not.toContain('BEGIN CERTIFICATE');
  });
});

describe('POST /couchbase/test', () => {
  it('rejects a non-Couchbase connection string', async () => {
    const res = await request(makeApp())
      .post('/couchbase/test')
      .send({ host: 'http://localhost:8091' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CONNECTION');
    expect(mockTestConnection).not.toHaveBeenCalled();
  });

  it('rejects private IP literals', async () => {
    const res = await request(makeApp())
      .post('/couchbase/test')
      .send({ host: 'couchbase://10.0.0.5' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Invalid host');
  });

  it('reuses stored secrets for an existing connection', async () => {
    mockGetConnectionById.mockResolvedValue(couchbaseConnection);
    mockTestConnection.mockResolvedValue({ success: true });
    const res = await request(makeApp()).post('/couchbase/test').send({
      host: 'couchbase://cb.example.com',
      username: 'reader',
      connectionId: CONNECTION_ID,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    expect(mockTestConnection.mock.calls[0][0]).toMatchObject({
      password: 'top-secret',
      tlsCaCertificate: couchbaseConnection.tlsCaCertificate,
    });
  });
});

describe('POST /couchbase/test-source', () => {
  const body = {
    connectionId: CONNECTION_ID,
    bucket: 'test',
    scope: 'app',
    collection: 'events',
  };

  it('returns 404 for a missing connection', async () => {
    mockGetConnectionById.mockResolvedValue(null);
    const res = await request(makeApp())
      .post('/couchbase/test-source')
      .send(body);
    expect(res.status).toBe(404);
  });

  it('returns 409 for a ClickHouse connection', async () => {
    mockGetConnectionById.mockResolvedValue({ kind: 'clickhouse' });
    const res = await request(makeApp())
      .post('/couchbase/test-source')
      .send(body);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('WRONG_CONNECTION_KIND');
  });

  it('returns the keyspace test result', async () => {
    mockGetConnectionById.mockResolvedValue(couchbaseConnection);
    mockTestKeyspace.mockResolvedValue({ success: true, sampleKeys: ['a'] });
    const res = await request(makeApp())
      .post('/couchbase/test-source')
      .send(body);
    expect(res.body).toEqual({ success: true, sampleKeys: ['a'] });
    expect(mockTestKeyspace.mock.calls[0][1]).toEqual({
      bucket: 'test',
      scope: 'app',
      collection: 'events',
    });
  });
});
