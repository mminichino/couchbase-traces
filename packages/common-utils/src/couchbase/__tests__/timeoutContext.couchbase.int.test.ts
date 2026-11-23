/**
 * D18: live-cluster connects that failed about 500 ms in with an SDK
 * "unambiguous timeout". The executor now logs the SDK's own diagnosis on a
 * TIMEOUT, and every connect gives DNS SRV a 2 s budget instead of 500 ms.
 * Requires port/couchbase-test (CBT_TEST_COUCHBASE_*).
 */
import { connect, UnambiguousTimeoutError } from 'couchbase';

import { clusterCache, CouchbaseNodeClient } from '@/couchbase/node';

import { liveConnection, probeLive } from './liveCluster';

const conn = liveConnection('d18-timeout-context');

let live = false;

beforeAll(async () => {
  live = await probeLive(conn, 'Timeout error context');
}, 120000);

afterAll(async () => {
  await clusterCache.closeAll();
});

describe('D18 timeout error context on a live cluster', () => {
  it('logs the SDK context when a query times out', async () => {
    if (!live) return;
    const warn = jest.fn();
    const logger = { debug() {}, info() {}, warn, error() {} };
    const err = await new CouchbaseNodeClient({ conn, team: null, logger })
      .query({
        // Long enough server-side that a 1 ms client timeout always fires.
        query: 'SELECT RAW COUNT(*) FROM ARRAY_RANGE(0, 2000000) AS n',
        format: 'JSON',
        timeoutMs: 1,
      })
      // The result streams; the timeout surfaces while reading it.
      .then(r => r.json())
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(err).toMatchObject({ code: 'TIMEOUT' });

    const call = warn.mock.calls.find(
      ([, msg]) => msg === 'Couchbase query timed out',
    );
    expect(call).toBeDefined();
    const sdk = (call?.[0] as { sdk: Record<string, unknown> }).sdk;
    expect(String(sdk.name)).toMatch(/TimeoutError$/);
    expect(sdk.context).toEqual(
      expect.objectContaining({ statement: expect.any(String) }),
    );
    expect(JSON.stringify(sdk)).not.toContain(conn.password ?? '\u0000');
  });

  // The D18 root cause: before every connect with a single hostname the SDK
  // looks up DNS SRV, and a lookup that outlives its budget fails the whole
  // connect with an unambiguous timeout. A nameserver that never answers
  // (TEST-NET-1) stands in for a slow resolver.
  it('fails the connect when DNS SRV outlives its budget, as the SDK does', async () => {
    if (!live) return;
    // The harness connstr turns SRV off; a bare hostname turns it back on.
    const port = /^couchbases?:\/\/[^/?:]+:(\d+)/.exec(conn.host)?.[1];
    const host = port
      ? `couchbase://localhost:${port}?network=external`
      : 'couchbase://localhost';
    const started = Date.now();
    const err = await connect(host, {
      username: conn.username,
      password: conn.password,
      dnsConfig: { nameserver: '192.0.2.1', dnsSrvTimeout: 300 },
    }).then(
      c => c.close().then(() => undefined),
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(UnambiguousTimeoutError);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
