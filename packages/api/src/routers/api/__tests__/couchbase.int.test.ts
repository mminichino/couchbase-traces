// Runs against the containers started by port/couchbase-test/run.sh: Couchbase
// for queries and the metadata store (users, teams, sessions), and Mongo for
// connections. It does not need ClickHouse, so it builds its own server
// instead of using MockServer.
import { CouchbaseClient } from '@couchbase-traces/common-utils/dist/couchbase/browser';
import {
  clusterCache,
  testConnection,
} from '@couchbase-traces/common-utils/dist/couchbase/node';
import http from 'http';
import mongoose from 'mongoose';

import app from '@/api-app';
import * as config from '@/config';
import {
  clearMetadataForTests,
  closeMetadataStore,
  startMetadataStore,
} from '@/metadata';

const CONNSTR =
  process.env.CBT_TEST_COUCHBASE_CONNSTR || 'couchbase://localhost';
const USER = process.env.CBT_TEST_COUCHBASE_USER || 'cbt_query';
const PASSWORD =
  process.env.CBT_TEST_COUCHBASE_PASSWORD || 'cbt-query-password';
const REQUIRED = process.env.CBT_TEST_COUCHBASE_REQUIRED === '1';

function pointCount(section: {
  data?: { series?: { points: unknown[] }[] };
}): number {
  const series = section.data?.series ?? [];
  let total = 0;
  for (const entry of series) total += entry.points.length;
  return total;
}

const CREDS = { email: 'couchbase-int@example.com', password: 'TacoCat!2#4X' };

const realFetch: typeof fetch = Reflect.get(globalThis, 'realFetch');

describe('Couchbase API integration', () => {
  let server: http.Server;
  let baseUrl = '';
  let cookie = '';
  let available = false;

  const api = (path: string, init: RequestInit = {}) =>
    realFetch(`${baseUrl}${path}`, {
      ...init,
      redirect: 'manual',
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {}),
        ...(init.headers ?? {}),
      },
    });

  beforeAll(async () => {
    const probe = await testConnection(
      { host: CONNSTR, username: USER, password: PASSWORD, wanProfile: false },
      15000,
    );
    available = probe.success;
    if (!available) {
      const reason = probe.success
        ? ''
        : `${probe.error.code}: ${probe.error.message}`;
      const msg = `Couchbase API integration test skipped: ${CONNSTR} is unreachable (${reason}). Start it with port/couchbase-test/run.sh.`;
      if (REQUIRED) throw new Error(msg);
      console.warn(msg);
      return;
    }
    if (config.MONGO_URI == null) throw new Error('MONGO_URI is not set');
    await mongoose.connect(config.MONGO_URI);
    await mongoose.connection.dropDatabase();
    // Teams, users, and sessions live in the metadata store since C1.
    await startMetadataStore();
    await clearMetadataForTests();

    server = http.createServer(app);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address == null || typeof address === 'string') {
      throw new Error('Test server has no TCP address');
    }
    baseUrl = `http://127.0.0.1:${address.port}`;

    const register = await api('/register/password', {
      method: 'POST',
      body: JSON.stringify({ ...CREDS, confirmPassword: CREDS.password }),
    });
    expect(register.status).toBe(200);
    const login = await api('/login/password', {
      method: 'POST',
      body: JSON.stringify(CREDS),
    });
    expect(login.status).toBe(303);
    cookie = login.headers
      .getSetCookie()
      .map(c => c.split(';')[0])
      .join('; ');
    expect(cookie).not.toBe('');
  }, 60000);

  afterAll(async () => {
    await clusterCache.closeAll();
    if (!available) return;
    await new Promise<void>(resolve => server.close(() => resolve()));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await clearMetadataForTests();
    await closeMetadataStore();
  });

  it('creates a connection, queries it, and reads it with CouchbaseClient', async () => {
    if (!available) {
      console.warn('skipped (Couchbase unreachable): full API path');
      return;
    }

    const created = await api('/connections', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'couchbase',
        name: 'Couchbase test container',
        host: CONNSTR,
        username: USER,
        password: PASSWORD,
        wanProfile: false,
      }),
    });
    expect(created.status).toBe(200);
    const createdBody: { id: string } = await created.json();
    const connectionId = createdBody.id;

    const listed = await api('/connections');
    const connections: Record<string, unknown>[] = await listed.json();
    const stored = connections.find(c => c.id === connectionId);
    expect(stored).toMatchObject({ kind: 'couchbase', host: CONNSTR });
    expect(stored).not.toHaveProperty('password');

    const statement =
      'SELECT e.ts, e.`level`, e.service FROM `test`.`app`.`events` AS e WHERE e.ts IS NOT MISSING ORDER BY e.ts DESC LIMIT $n';
    const raw = await api('/couchbase/query', {
      method: 'POST',
      body: JSON.stringify({
        connectionId,
        statement,
        parameters: { n: 25 },
        format: 'JSONEachRow',
      }),
    });
    const body = await raw.text();
    expect({
      status: raw.status,
      body: raw.status === 200 ? '' : body,
    }).toEqual({
      status: 200,
      body: '',
    });
    expect(raw.headers.get('content-type')).toBe(
      'application/x-ndjson; charset=utf-8',
    );
    const frames: { type: string; rows?: unknown }[] = body
      .split('\n')
      .filter(l => l.trim() !== '')
      .map(l => JSON.parse(l));
    expect(frames[0]?.type).toBe('meta');
    expect(frames.at(-1)).toMatchObject({ type: 'end', rows: 25 });

    const client = new CouchbaseClient({
      baseUrl,
      fetchImpl: (input, init) => {
        const url = String(input).replace('/api/couchbase/', '/couchbase/');
        const headers = new Headers(init?.headers);
        headers.set('Cookie', cookie);
        return realFetch(url, { ...init, headers });
      },
    });
    const rs = await client.query({
      connectionId,
      query: statement,
      query_params: { n: 25 },
      format: 'JSON',
    });
    const result = await rs.json<{
      ts: string;
      level: string;
      service: string;
    }>();
    expect(result.data).toHaveLength(25);
    expect(result.rows).toBe(25);
    const types = Object.fromEntries(
      (result.meta ?? []).map(m => [m.name, m.type]),
    );
    expect(types).toEqual({
      ts: "DateTime64(9, 'UTC')",
      level: 'String',
      service: 'String',
    });
    const timestamps = result.data.map(r => r.ts);
    expect([...timestamps].sort().reverse()).toEqual(timestamps);

    const denied = await client
      .query({ connectionId, query: 'DELETE FROM `test`.`app`.`events`' })
      .then(
        () => null,
        (e: unknown) => e,
      );
    expect(denied).toMatchObject({ code: 'STATEMENT_NOT_ALLOWED' });
  }, 60000);

  function managementPort(): number {
    const match = /:(\d+)/.exec(CONNSTR);
    const kv = match ? Number(match[1]) : 11210;
    return 8091 + (kv - 11210);
  }

  async function createCouchbaseConnection(body: Record<string, unknown>) {
    const created = await api('/connections', {
      method: 'POST',
      body: JSON.stringify({
        kind: 'couchbase',
        host: CONNSTR,
        wanProfile: false,
        managementPort: managementPort(),
        ...body,
      }),
    });
    expect(created.status).toBe(200);
    const createdBody: { id: string } = await created.json();
    return createdBody.id;
  }

  it('serves cluster status, infrastructure, and queries', async () => {
    if (!available) return;
    const connectionId = await createCouchbaseConnection({
      name: 'Cluster monitor',
      username: USER,
      password: PASSWORD,
      monitorUsername:
        process.env.CBT_TEST_COUCHBASE_MONITOR_USER || 'cbt_monitor',
      monitorPassword:
        process.env.CBT_TEST_COUCHBASE_MONITOR_PASSWORD ||
        'cbt-monitor-password',
    });
    const listed = await api('/connections');
    const stored: Record<string, unknown>[] = await listed.json();
    const row = stored.find(item => item.id === connectionId);
    expect(row).not.toHaveProperty('monitorPassword');
    expect(row).not.toHaveProperty('password');

    const now = Date.now();
    const status = await api(`/couchbase/cluster/${connectionId}/status`);
    expect(status.status).toBe(200);
    const statusBody = await status.json();
    expect(statusBody.cluster.available).toBe(true);
    expect(statusBody.nodes.available).toBe(true);
    expect(statusBody.buckets.available).toBe(true);
    expect(statusBody.tasks.available).toBe(true);
    expect(statusBody.cluster.data.nodeCount).toBeGreaterThan(0);

    const infra = await api(
      `/couchbase/cluster/${connectionId}/infrastructure?from=${now - 15 * 60 * 1000}&to=${now}`,
    );
    expect(infra.status).toBe(200);
    const infraBody = await infra.json();
    const measures = [
      infraBody.cpu,
      infraBody.freeMemory,
      infraBody.dataOps,
      infraBody.bucketMemory,
      infraBody.diskWriteQueue,
      infraBody.queryRequests,
      infraBody.queryErrors,
      infraBody.queryAvgTime,
      infraBody.indexRequests,
      infraBody.searchQueries,
    ];
    console.log(
      measures
        .map(
          section =>
            `${section.data?.measure ?? 'measure'} available=${section.available} points=${pointCount(section)} ${section.detail?.httpStatus ?? ''} ${section.detail?.message ?? ''}`,
        )
        .join('\n'),
    );
    for (const section of measures) {
      expect(section.available).toBe(true);
    }
    expect(measures.some(section => pointCount(section) > 0)).toBe(true);

    const queries = await api(
      `/couchbase/cluster/${connectionId}/queries?from=${now - 15 * 60 * 1000}&to=${now}`,
    );
    expect(queries.status).toBe(200);
    const queriesBody = await queries.json();
    expect(queriesBody.note).toContain('threshold');
    const recent = queriesBody.recent.data ?? [];
    const users = recent.map((row: { users?: string }) => row.users);
    console.log(
      `completed-requests recent=${recent.length} users=${JSON.stringify([...new Set(users)])} buckets=${(queriesBody.completedOverTime.data ?? []).length} indexes=${(queriesBody.indexes.data ?? []).length}`,
    );
    const sections = [
      ['active', queriesBody.active],
      ['completedOverTime', queriesBody.completedOverTime],
      ['topStatements', queriesBody.topStatements],
      ['recent', queriesBody.recent],
      ['indexes', queriesBody.indexes],
    ] as const;
    for (const [name, section] of sections) {
      if (section.available !== true) {
        console.log(
          `query-section ${name} ${section.reason} ${section.detail?.message ?? ''}`,
        );
      }
    }
    expect(queriesBody.active.available).toBe(true);
    expect(queriesBody.completedOverTime.available).toBe(true);
    expect(queriesBody.topStatements.available).toBe(true);
    expect(queriesBody.recent.available).toBe(true);
    expect(queriesBody.indexes.available).toBe(true);
  }, 120000);

  it('restricts status and infrastructure for a monitor user with no roles', async () => {
    if (!available) return;
    const connectionId = await createCouchbaseConnection({
      name: 'Cluster no roles',
      username: USER,
      password: PASSWORD,
      monitorUsername:
        process.env.CBT_TEST_COUCHBASE_MONITOR_NONE_USER || 'cbt_monitor_none',
      monitorPassword:
        process.env.CBT_TEST_COUCHBASE_MONITOR_NONE_PASSWORD ||
        'cbt-monitor-none-password',
    });
    const status = await api(`/couchbase/cluster/${connectionId}/status`);
    const statusBody = await status.json();
    expect(statusBody.cluster).toMatchObject({
      available: false,
      reason: 'restricted',
    });
    const now = Date.now();
    const infra = await api(
      `/couchbase/cluster/${connectionId}/infrastructure?from=${now - 60_000}&to=${now}`,
    );
    const infraBody = await infra.json();
    expect(infraBody.cpu).toMatchObject({
      available: false,
      reason: 'restricted',
    });
  }, 60000);

  it('restricts system queries for a user without query_system_catalog', async () => {
    if (!available) return;
    const connectionId = await createCouchbaseConnection({
      name: 'Cluster limited query',
      username:
        process.env.CBT_TEST_COUCHBASE_LIMITED_QUERY_USER ||
        'cbt_query_limited',
      password:
        process.env.CBT_TEST_COUCHBASE_LIMITED_QUERY_PASSWORD ||
        'cbt-query-limited-password',
      monitorUsername:
        process.env.CBT_TEST_COUCHBASE_MONITOR_USER || 'cbt_monitor',
      monitorPassword:
        process.env.CBT_TEST_COUCHBASE_MONITOR_PASSWORD ||
        'cbt-monitor-password',
    });
    const now = Date.now();
    const queries = await api(
      `/couchbase/cluster/${connectionId}/queries?from=${now - 60_000}&to=${now}`,
    );
    expect(queries.status).toBe(200);
    const body = await queries.json();
    console.log(
      `limited-query indexes available=${body.indexes.available} rows=${(body.indexes.data ?? []).length} ${body.indexes.detail?.message ?? ''} recent available=${body.recent.available} rows=${(body.recent.data ?? []).length} ${body.recent.detail?.message ?? ''}`,
    );
    expect(body.indexes.available).toBe(true);
    expect(body.recent).toMatchObject({
      available: false,
      reason: 'restricted',
    });
  }, 60000);
});
