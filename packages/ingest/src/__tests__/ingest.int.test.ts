import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { type Cluster, connect } from 'couchbase';

import { connectCluster, loadConfig } from '@/config';
import { createIngestApp } from '@/server';
import { runSetup } from '@/setup/cli';
import { Writer } from '@/writer';

const exec = promisify(execFile);
jest.setTimeout(1_200_000);

const TOKEN = '0123456789abcdef0123456789abcdef';
const CONTAINER =
  process.env.CBT_TEST_COUCHBASE_CONTAINER || 'cbt-couchbase-test';

function env(): NodeJS.ProcessEnv {
  const connstr =
    process.env.CBT_TEST_COUCHBASE_CONNSTR || process.env.CBT_COUCHBASE_CONNSTR;
  if (!connstr) throw new Error('CBT_TEST_COUCHBASE_CONNSTR is required');
  return {
    ...process.env,
    CBT_COUCHBASE_CONNSTR: connstr,
    CBT_COUCHBASE_ADMIN_USER:
      process.env.CBT_TEST_COUCHBASE_ADMIN_USER || 'Administrator',
    CBT_COUCHBASE_ADMIN_PASSWORD:
      process.env.CBT_TEST_COUCHBASE_ADMIN_PASSWORD || 'cbt-test-admin',
    CBT_COUCHBASE_QUERY_USER: 'cbt_otel_query',
    CBT_COUCHBASE_QUERY_PASSWORD: 'cbt-otel-query-password',
    CBT_COUCHBASE_INGEST_USER: 'cbt_otel_ingest',
    CBT_COUCHBASE_INGEST_PASSWORD: 'cbt-otel-ingest-password',
    CBT_COUCHBASE_BUCKET: 'otel',
    CBT_COUCHBASE_SCOPE: 'default',
    CBT_LOGS_TTL: '1h',
    CBT_INGEST_TOKEN: TOKEN,
    CBT_INGEST_HOST: '127.0.0.1',
    CBT_INGEST_KV_TIMEOUT_MS: '4000',
  };
}

const setupEnv = env();
const eventSec = Math.floor(Date.now() / 1000) - 120;
const eventIso = new Date(eventSec * 1000)
  .toISOString()
  .replace('.000Z', '.000000000Z');
const BODY = 'oracle unique body for the search test';

async function query(
  cluster: Cluster,
  statement: string,
  parameters?: Record<string, unknown>,
) {
  try {
    const result = await cluster.query(
      statement,
      parameters ? { parameters } : {},
    );
    return result.rows as unknown[];
  } catch (err) {
    const detail = err as {
      message?: string;
      context?: unknown;
      cause?: unknown;
    };
    throw new Error(
      `${detail.message ?? err} ${JSON.stringify(detail.context ?? detail.cause ?? '')}`,
    );
  }
}

async function listen(
  server: ReturnType<typeof createIngestApp>['server'],
): Promise<number> {
  await new Promise<void>(resolve => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (address == null || typeof address === 'string')
    throw new Error('no port');
  return address.port;
}

async function postLog(
  port: number,
  body: string,
  nanos: string,
): Promise<number> {
  const response = await fetch(`http://127.0.0.1:${port}/v1/logs`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${TOKEN}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      resourceLogs: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'ingest-int' } },
            ],
          },
          scopeLogs: [
            {
              logRecords: [
                {
                  timeUnixNano: nanos,
                  body: { stringValue: body },
                  severityText: 'INFO',
                },
              ],
            },
          ],
        },
      ],
    }),
  });
  return response.status;
}

describe('ingest integration', () => {
  let admin: Cluster;
  let port = 0;
  let app: ReturnType<typeof createIngestApp>;
  let ingestCluster: Cluster;

  beforeAll(async () => {
    const first: string[] = [];
    const created = await runSetup(
      [
        '--create-bucket',
        '--create-users',
        '--bucket-ram-mb',
        '256',
        '--index-replicas',
        '0',
      ],
      setupEnv,
      line => first.push(line),
    );
    if (created !== 0) throw new Error(first.join('\n'));
    expect(first.some(line => line.startsWith('created bucket'))).toBe(true);
    expect(
      first.some(line => line.includes('created search fts_otel_logs')),
    ).toBe(true);

    const second: string[] = [];
    const again = await runSetup(
      [
        '--create-bucket',
        '--create-users',
        '--bucket-ram-mb',
        '256',
        '--index-replicas',
        '0',
      ],
      setupEnv,
      line => second.push(line),
    );
    if (again !== 0) throw new Error(second.join('\n'));
    expect(
      second.filter(line => line.startsWith('exists ')).length,
    ).toBeGreaterThan(10);

    const before = Date.now();
    const dry = await runSetup(
      ['--dry-run'],
      {
        ...setupEnv,
        CBT_COUCHBASE_ADMIN_PASSWORD: 'wrong-password-not-used',
      },
      () => undefined,
    );
    expect(dry).toBe(0);
    expect(Date.now() - before).toBeLessThan(2000);

    admin = await connect(setupEnv.CBT_COUCHBASE_CONNSTR ?? '', {
      username: setupEnv.CBT_COUCHBASE_ADMIN_USER,
      password: setupEnv.CBT_COUCHBASE_ADMIN_PASSWORD,
      timeouts: { connectTimeout: 20_000, queryTimeout: 60_000 },
    });

    const config = loadConfig(setupEnv);
    ingestCluster = await connectCluster(config);
    const scope = ingestCluster.bucket(config.bucket).scope(config.scope);
    const writer = new Writer({
      scope,
      concurrency: config.kvConcurrency,
      timeoutMs: config.kvTimeoutMs,
      maxDocBytes: config.maxDocBytes,
      ttl: config.ttl,
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    });
    app = createIngestApp({
      config,
      writer,
      ready: async () => {
        try {
          await scope
            .collection('otel_logs')
            .exists('__cbt_probe__', { timeout: 2000 });
          return true;
        } catch {
          return false;
        }
      },
    });
    port = await listen(app.server);
  });

  afterAll(async () => {
    app?.server.close();
    await ingestCluster?.close().catch(() => undefined);
    await admin?.close().catch(() => undefined);
  });

  it('brings GSI online and creates both search indexes', async () => {
    const rows = await query(
      admin,
      "SELECT RAW name FROM system:indexes WHERE bucket_id = 'otel' AND state = 'online'",
    );
    expect(rows).toEqual(
      expect.arrayContaining(['ix_logs_ts', 'ix_traces_spanattr_items']),
    );
    const ftsPort = process.env.CBT_TEST_CB_PORT_8094 ?? '8094';
    const listed = await fetch(
      `http://127.0.0.1:${ftsPort}/api/bucket/otel/scope/default/index`,
      {
        headers: {
          authorization: `Basic ${Buffer.from(
            `${setupEnv.CBT_COUCHBASE_ADMIN_USER}:${setupEnv.CBT_COUCHBASE_ADMIN_PASSWORD}`,
          ).toString('base64')}`,
        },
      },
    );
    const body = await listed.text();
    expect(listed.status).toBe(200);
    expect(body).toContain('fts_otel_logs');
    expect(body).toContain('fts_otel_traces');
  });

  it('writes a log, uses ix_logs_ts, finds the body, and sets expiry', async () => {
    const nanos = `${eventSec}000000000`;
    expect(await postLog(port, BODY, nanos)).toBe(200);
    expect(await postLog(port, BODY, nanos)).toBe(200);

    let rows: unknown[] = [];
    for (let attempt = 0; attempt < 20; attempt++) {
      rows = await query(
        admin,
        'SELECT RAW COUNT(*) FROM `otel`.`default`.`otel_logs` AS d WHERE d.Timestamp = $ts AND d.Body = $body',
        { ts: eventIso, body: BODY },
      );
      if (rows[0] === 1) break;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (rows[0] !== 1) {
      const sample = await query(
        admin,
        'SELECT d.Timestamp, d.Body FROM `otel`.`default`.`otel_logs` AS d WHERE d.Timestamp >= $start AND d.Timestamp < $end',
        { start: eventIso, end: '2999-01-01T00:00:00.000000000Z' },
      );
      throw new Error(
        `count ${JSON.stringify(rows)} sample ${JSON.stringify(sample)}`,
      );
    }

    const plan = await query(
      admin,
      'EXPLAIN SELECT d.Body FROM `otel`.`default`.`otel_logs` AS d WHERE d.Timestamp >= $start AND d.Timestamp < $end',
      { start: eventIso, end: '2999-01-01T00:00:00.000000000Z' },
    );
    expect(JSON.stringify(plan)).toContain('ix_logs_ts');

    const start = new Date((eventSec - 60) * 1000).toISOString();
    const end = new Date((eventSec + 60) * 1000).toISOString();
    let found: unknown[] = [];
    let searchError = '';
    for (let i = 0; i < 30; i++) {
      try {
        found = await query(
          admin,
          'SELECT d.Body FROM `otel`.`default`.`otel_logs` AS d WHERE SEARCH(d, $query, {"index":"otel.default.fts_otel_logs"})',
          {
            query: {
              query: {
                conjuncts: [
                  { match: 'oracle', field: 'Body' },
                  {
                    start,
                    end,
                    inclusive_start: true,
                    inclusive_end: true,
                    field: 'Timestamp',
                  },
                ],
              },
            },
          },
        );
        searchError = '';
      } catch (err) {
        searchError = err instanceof Error ? err.message : String(err);
        found = [];
      }
      if (found.length > 0) break;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    if (found.length === 0) {
      const ftsPort = process.env.CBT_TEST_CB_PORT_8094 ?? '8094';
      const fts = await fetch(
        `http://127.0.0.1:${ftsPort}/api/bucket/otel/scope/default/index/fts_otel_logs/query`,
        {
          method: 'POST',
          headers: {
            authorization: `Basic ${Buffer.from(
              `${setupEnv.CBT_COUCHBASE_ADMIN_USER}:${setupEnv.CBT_COUCHBASE_ADMIN_PASSWORD}`,
            ).toString('base64')}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            query: { match: 'oracle', field: 'Body' },
            size: 1,
          }),
        },
      );
      searchError = `${searchError} fts=${fts.status} ${await fts.text()}`;
    }
    expect(searchError).toBe('');
    expect(found.length).toBeGreaterThan(0);

    const meta = await query(
      admin,
      'SELECT META(d).expiration AS expiration FROM `otel`.`default`.`otel_logs` AS d WHERE d.Timestamp = $ts AND d.Body = $body',
      { ts: eventIso, body: BODY },
    );
    const expiration = (meta[0] as { expiration?: number } | undefined)
      ?.expiration;
    expect(expiration).toBe(eventSec + 3600);
  });

  it('refuses query access to the ingest user and writes to the query user', async () => {
    const reader = await connect(setupEnv.CBT_COUCHBASE_CONNSTR ?? '', {
      username: 'cbt_otel_ingest',
      password: 'cbt-otel-ingest-password',
      timeouts: { connectTimeout: 20_000, queryTimeout: 20_000 },
    });
    await expect(
      reader.query(
        'SELECT RAW 1 FROM `otel`.`default`.`otel_logs` AS d LIMIT 1',
      ),
    ).rejects.toThrow();
    await reader.close();

    const writer = await connect(setupEnv.CBT_COUCHBASE_CONNSTR ?? '', {
      username: 'cbt_otel_query',
      password: 'cbt-otel-query-password',
      timeouts: { connectTimeout: 20_000, kvTimeout: 20_000 },
    });
    await expect(
      writer
        .bucket('otel')
        .scope('default')
        .collection('otel_logs')
        .upsert('denied', { a: 1 }),
    ).rejects.toThrow();
    await writer.close();
  });

  it('returns 503 while Couchbase is down and accepts the batch after restart', async () => {
    await exec('docker', ['stop', CONTAINER]);
    expect(await postLog(port, 'while-down', `${eventSec + 1}000000000`)).toBe(
      503,
    );
    await exec('docker', ['start', CONTAINER]);
    let status = 0;
    for (let i = 0; i < 45; i++) {
      status = await postLog(
        port,
        'after-restart',
        `${eventSec + 2}000000000`,
      ).catch(() => 0);
      if (status === 200) break;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    expect(status).toBe(200);
  });
});
