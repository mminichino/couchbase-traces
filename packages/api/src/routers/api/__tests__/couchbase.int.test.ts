// Runs against the containers started by port/couchbase-test/run.sh: Couchbase
// for queries and Mongo for users, sessions, and connections. It does not need
// ClickHouse, so it builds its own server instead of using MockServer.
import { CouchbaseClient } from '@couchbase-traces/common-utils/dist/couchbase/browser';
import {
  clusterCache,
  testConnection,
} from '@couchbase-traces/common-utils/dist/couchbase/node';
import http from 'http';
import mongoose from 'mongoose';

import app from '@/api-app';
import * as config from '@/config';

const CONNSTR =
  process.env.CBT_TEST_COUCHBASE_CONNSTR || 'couchbase://localhost';
const USER = process.env.CBT_TEST_COUCHBASE_USER || 'cbt_query';
const PASSWORD =
  process.env.CBT_TEST_COUCHBASE_PASSWORD || 'cbt-query-password';
const REQUIRED = process.env.CBT_TEST_COUCHBASE_REQUIRED === '1';

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
});
