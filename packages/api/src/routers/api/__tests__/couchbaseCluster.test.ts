import express from 'express';
import request from 'supertest';

const mockExecuteQuery = jest.fn();
const mockManagementCall = jest.fn();
const mockGetConnectionById = jest.fn();

jest.mock('@couchbase-traces/common-utils/dist/couchbase/node', () => ({
  executeQuery: (...args: unknown[]) => mockExecuteQuery(...args),
  clusterCache: { invalidate: jest.fn(), closeAll: jest.fn() },
}));

jest.mock('@/utils/couchbaseManagement', () => {
  const actual = jest.requireActual('@/utils/couchbaseManagement');
  return {
    ...actual,
    managementCall: (...args: unknown[]) => mockManagementCall(...args),
  };
});

jest.mock('@/controllers/connection', () => ({
  ...jest.requireActual('@/controllers/connection'),
  getConnectionById: (...args: unknown[]) => mockGetConnectionById(...args),
}));

jest.mock('@/controllers/team', () => ({
  getTeam: jest.fn().mockResolvedValue(null),
}));

import couchbaseClusterRouter, {
  clearClusterStatusCache,
} from '@/routers/api/couchbaseCluster';

const TEAM_ID = '65f0a0a0a0a0a0a0a0a0a0a0';
const CONNECTION_ID = '65f0b0b0b0b0b0b0b0b0b0b0';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, {
      user: { _id: 'user', email: 'u@example.com', team: TEAM_ID },
    });
    next();
  });
  app.use('/couchbase/cluster', couchbaseClusterRouter);
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const message =
        err instanceof Error ? (err.stack ?? err.message) : String(err);
      res.status(500).type('text/plain').send(message);
    },
  );
  return app;
}

function connection(overrides: Record<string, unknown> = {}) {
  return {
    id: CONNECTION_ID,
    kind: 'couchbase',
    host: 'couchbase://cb.example.com',
    username: 'reader',
    password: 'top-secret',
    monitorUsername: 'monitor',
    monitorPassword: 'monitor-secret',
    updatedAt: new Date('2026-11-12T00:00:00Z'),
    ...overrides,
  };
}

const pools = {
  clusterName: 'cbt',
  balanced: true,
  nodes: [
    {
      hostname: '127.0.0.1:8091',
      status: 'healthy',
      clusterMembership: 'active',
      services: ['kv'],
      version: '8.0.3',
      systemStats: { cpu_utilization_rate: 3, mem_total: 100, mem_free: 40 },
      uptime: '10',
    },
  ],
};

function httpFailure(status: number) {
  return {
    ok: false,
    detail: { httpStatus: status, message: `HTTP ${status}` },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  clearClusterStatusCache();
  mockGetConnectionById.mockResolvedValue(connection());
  mockManagementCall.mockImplementation(async (args: { url: string }) => {
    if (args.url.endsWith('/pools/default/stats/range')) {
      return {
        ok: true,
        json: [
          {
            metric: { nodes: ['n1'] },
            values: [
              [1_700_000_000_000, '1'],
              [1_700_000_010_000, '3'],
            ],
            applyFunctions: ['rate'],
          },
        ],
      };
    }
    if (args.url.endsWith('/pools/default/buckets'))
      return { ok: true, json: [] };
    if (args.url.endsWith('/pools/default/tasks'))
      return { ok: true, json: [] };
    if (args.url.endsWith('/pools/default')) return { ok: true, json: pools };
    return httpFailure(500);
  });
});

describe('cluster routes', () => {
  it('returns status from the management API', async () => {
    const res = await request(makeApp()).get(
      `/couchbase/cluster/${CONNECTION_ID}/status`,
    );
    expect(res.status).toBe(200);
    expect(res.body.cluster).toMatchObject({
      available: true,
      data: { name: 'cbt', version: '8.0.3', balanced: true, nodeCount: 1 },
    });
    expect(res.body.nodes.data[0].hostname).toBe('127.0.0.1:8091');
    expect(JSON.stringify(res.body)).not.toContain('monitor-secret');
  });

  it.each([401, 403, 404, 500])('maps HTTP %s to restricted', async status => {
    mockManagementCall.mockResolvedValue(httpFailure(status));
    const res = await request(makeApp()).get(
      `/couchbase/cluster/${CONNECTION_ID}/status`,
    );
    expect(res.status).toBe(200);
    expect(res.body.cluster).toMatchObject({
      available: false,
      reason: 'restricted',
      detail: { httpStatus: status },
    });
  });

  it.each([
    ['connection_refused', 'Connection refused'],
    ['dns', 'Could not resolve host'],
    ['tls', 'TLS verification failed'],
    ['timeout', 'Timed out'],
  ])('maps %s to restricted', async (code, message) => {
    mockManagementCall.mockResolvedValue({
      ok: false,
      detail: { code, message },
    });
    const res = await request(makeApp()).get(
      `/couchbase/cluster/${CONNECTION_ID}/status`,
    );
    expect(res.body.nodes).toMatchObject({
      available: false,
      reason: 'restricted',
      detail: { code, message },
    });
  });

  it('does not call the network when the monitoring credential is missing', async () => {
    mockGetConnectionById.mockResolvedValue(
      connection({ monitorPassword: '' }),
    );
    const res = await request(makeApp()).get(
      `/couchbase/cluster/${CONNECTION_ID}/status`,
    );
    expect(mockManagementCall).not.toHaveBeenCalled();
    expect(res.body.cluster.reason).toBe('not_configured');
    expect(res.body.buckets.reason).toBe('not_configured');
  });

  it('returns 404 for another team and 409 for a ClickHouse connection', async () => {
    mockGetConnectionById.mockResolvedValue(null);
    const missing = await request(makeApp()).get(
      `/couchbase/cluster/${CONNECTION_ID}/status`,
    );
    expect(missing.status).toBe(404);

    mockGetConnectionById.mockResolvedValue(connection({ kind: 'clickhouse' }));
    const clickhouse = await request(makeApp()).get(
      `/couchbase/cluster/${CONNECTION_ID}/status`,
    );
    expect(clickhouse.status).toBe(409);
    expect(mockManagementCall).not.toHaveBeenCalled();
  });

  it('rejects a private IP without a network call', async () => {
    mockGetConnectionById.mockResolvedValue(
      connection({ host: 'couchbase://10.1.2.3' }),
    );
    const res = await request(makeApp()).get(
      `/couchbase/cluster/${CONNECTION_ID}/status`,
    );
    expect(mockManagementCall).not.toHaveBeenCalled();
    expect(res.body.cluster).toMatchObject({
      available: false,
      reason: 'restricted',
      detail: { message: 'Invalid host' },
    });
  });

  it('returns infrastructure series', async () => {
    const res = await request(makeApp()).get(
      `/couchbase/cluster/${CONNECTION_ID}/infrastructure?from=1000&to=2000`,
    );
    expect(res.status).toBe(200);
    expect(res.body.cpu).toMatchObject({
      available: true,
      data: { unit: 'percent', series: [{ node: 'n1' }] },
    });
  });

  it('leaves infrastructure unconfigured without a monitoring user', async () => {
    mockGetConnectionById.mockResolvedValue(
      connection({ monitorUsername: undefined }),
    );
    const res = await request(makeApp()).get(
      `/couchbase/cluster/${CONNECTION_ID}/infrastructure?from=1000&to=2000`,
    );
    expect(mockManagementCall).not.toHaveBeenCalled();
    expect(res.body.cpu.reason).toBe('not_configured');
  });

  it('returns query sections from the executor', async () => {
    mockExecuteQuery.mockImplementation(async function* () {
      yield {
        type: 'rows',
        rows: [
          {
            requestId: 'req-1',
            statement: 'SELECT 1',
            state: 'running',
            elapsedTime: '1ms',
            users: 'cbt_query',
            node: '127.0.0.1',
            bucketMs: 1000,
            count: 2,
            errors: 0,
          },
        ],
      };
      yield {
        type: 'end',
        rows: 1,
        statistics: { elapsed: 1, rows_read: 1, bytes_read: 1 },
      };
    });
    const res = await request(makeApp()).get(
      `/couchbase/cluster/${CONNECTION_ID}/queries?from=1000&to=2000`,
    );
    expect(res.status).toBe(200);
    expect(res.body.note).toContain('threshold');
    expect(res.body.active.data[0].statement).toBe('SELECT 1');
    expect(res.body.completedOverTime.available).toBe(true);
    expect(mockExecuteQuery).toHaveBeenCalled();
  });

  it('maps a query error to restricted and skips a private host', async () => {
    mockExecuteQuery.mockImplementation(async function* () {
      yield {
        type: 'error',
        error: {
          code: 'PERMISSION_DENIED',
          message: 'not allowed',
          sqlppCode: null,
        },
      };
    });
    const denied = await request(makeApp()).get(
      `/couchbase/cluster/${CONNECTION_ID}/queries?from=1000&to=2000`,
    );
    expect(denied.body.indexes).toMatchObject({
      available: false,
      reason: 'restricted',
      detail: { code: 'PERMISSION_DENIED' },
    });

    mockExecuteQuery.mockClear();
    mockGetConnectionById.mockResolvedValue(
      connection({ host: 'couchbase://10.1.2.3' }),
    );
    const local = await request(makeApp()).get(
      `/couchbase/cluster/${CONNECTION_ID}/queries?from=1000&to=2000`,
    );
    expect(mockExecuteQuery).not.toHaveBeenCalled();
    expect(local.body.active.detail.message).toBe('Invalid host');
  });
});
