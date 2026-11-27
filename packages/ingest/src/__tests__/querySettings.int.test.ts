import { dnsConfig } from '@couchbase-traces/common-utils/dist/couchbase/dnsConfig';
import { buildQueryId } from '@couchbase-traces/common-utils/dist/query/attribution';
import { type Cluster, connect } from 'couchbase';

import {
  ensureQuerySettings,
  managementUrl,
  type MgmtHttp,
  type MgmtRequest,
  nodeMgmtHttp,
} from '@/setup/querySettings';

// P13 against a live 8.0 node (port/couchbase-test/run.sh): the cluster-wide
// setting reaches the query service, and a fast query carrying the API's
// `hdx-<surface>-<uuid>` context id is then kept in system:completed_requests.
jest.setTimeout(180_000);

const connstr =
  process.env.CBT_TEST_COUCHBASE_CONNSTR ?? 'couchbase://localhost';
const adminUser = process.env.CBT_TEST_COUCHBASE_ADMIN_USER || 'Administrator';
const adminPassword =
  process.env.CBT_TEST_COUCHBASE_ADMIN_PASSWORD || 'cbt-test-admin';
const mgmtUrl = managementUrl(connstr, {
  CBT_COUCHBASE_MGMT_PORT: process.env.CBT_TEST_CB_PORT_8091 ?? '8091',
});

/** Wraps the real client and records the methods it sent. */
function recording(): { http: MgmtHttp; methods: string[] } {
  const inner = nodeMgmtHttp();
  const methods: string[] = [];
  return {
    methods,
    http: (req: MgmtRequest) => {
      methods.push(req.method);
      return inner(req);
    },
  };
}

async function currentSettings(): Promise<Record<string, unknown>> {
  const res = await nodeMgmtHttp()({
    method: 'GET',
    url: `${mgmtUrl}/settings/querySettings`,
    username: adminUser,
    password: adminPassword,
  });
  expect(res.status).toBe(200);
  return JSON.parse(res.body);
}

describe('cluster query settings (P13)', () => {
  let cluster: Cluster;
  let original: { threshold: number; limit: number };

  beforeAll(async () => {
    const settings = await currentSettings();
    original = {
      threshold: Number(settings.queryCompletedThreshold),
      limit: Number(settings.queryCompletedLimit),
    };
    cluster = await connect(connstr, {
      username: adminUser,
      password: adminPassword,
      timeouts: { connectTimeout: 20_000, queryTimeout: 60_000 },
      dnsConfig: dnsConfig(),
    });
  });

  afterAll(async () => {
    // Put the node back the way the suite found it.
    await ensureQuerySettings({
      mgmtUrl,
      username: adminUser,
      password: adminPassword,
      wanted: {
        completedThresholdMs: original.threshold,
        completedLimit: original.limit,
      },
      dryRun: false,
      capella: false,
      http: nodeMgmtHttp(),
      log: () => undefined,
    });
    await cluster?.close().catch(() => undefined);
  });

  const apply = async (http: MgmtHttp, dryRun = false) => {
    const lines: string[] = [];
    const result = await ensureQuerySettings({
      mgmtUrl,
      username: adminUser,
      password: adminPassword,
      wanted: { completedThresholdMs: 0, completedLimit: 4321 },
      dryRun,
      capella: false,
      http,
      log: line => lines.push(line),
    });
    return { result, lines };
  };

  it('dry run lists the keys and writes nothing', async () => {
    const rec = recording();
    const { result } = await apply(rec.http, true);
    expect(result.changed).toEqual(
      expect.arrayContaining(['queryCompletedThreshold']),
    );
    expect(rec.methods).toEqual(['GET']);
    expect((await currentSettings()).queryCompletedThreshold).toBe(
      original.threshold,
    );
  });

  it('writes the cluster setting, then a second run writes nothing', async () => {
    const first = await apply(nodeMgmtHttp());
    expect(first.result.changed).toEqual(
      expect.arrayContaining([
        'queryCompletedThreshold',
        'queryCompletedLimit',
      ]),
    );
    const settings = await currentSettings();
    expect(settings.queryCompletedThreshold).toBe(0);
    expect(settings.queryCompletedLimit).toBe(4321);

    const rec = recording();
    const again = await apply(rec.http);
    expect(again.result).toEqual({ changed: [] });
    expect(rec.methods).toEqual(['GET']);
  });

  it('keeps a fast attributed query in system:completed_requests', async () => {
    const id = buildQueryId({ surface: 'search' });
    await cluster.query('SELECT 1 AS one', { clientContextId: id });
    // The query node applies the cluster setting asynchronously, and the
    // completed entry lands just after the response; poll briefly.
    const deadline = Date.now() + 30_000;
    let rows: unknown[] = [];
    while (Date.now() < deadline) {
      const result = await cluster.query(
        'SELECT r.clientContextID FROM system:completed_requests AS r WHERE r.clientContextID = $id',
        { parameters: { id } },
      );
      rows = result.rows;
      if (rows.length > 0) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
      await cluster.query('SELECT 1 AS one', { clientContextId: id });
    }
    expect(id).toMatch(/^hdx-search-/);
    expect(rows).toEqual(expect.arrayContaining([{ clientContextID: id }]));
  });

  it('a user without Cluster Admin gets a warning, not a failure', async () => {
    const lines: string[] = [];
    const result = await ensureQuerySettings({
      mgmtUrl,
      username: process.env.CBT_TEST_COUCHBASE_USER || 'cbt_query',
      password: process.env.CBT_TEST_COUCHBASE_PASSWORD || 'cbt-query-password',
      wanted: { completedThresholdMs: 5 },
      dryRun: false,
      capella: false,
      http: nodeMgmtHttp(),
      log: line => lines.push(line),
    });
    expect(result).toEqual({ changed: [], skipped: 'forbidden' });
    expect(lines[0]).toMatch(/Full Admin or Cluster Admin/);
  });
});
