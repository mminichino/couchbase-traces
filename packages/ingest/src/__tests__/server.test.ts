import { request } from 'node:http';
import { gzipSync } from 'node:zlib';

import type { IngestConfig } from '@/config';
import { createIngestApp, type IngestWriter } from '@/server';
import type { Doc } from '@/transform/common';
import type { WriteOutcome } from '@/writer';

const TOKEN = '0123456789abcdef0123456789abcdef';

function config(partial: Partial<IngestConfig> = {}): IngestConfig {
  return {
    port: 0,
    host: '127.0.0.1',
    token: TOKEN,
    maxBodyBytes: 64,
    maxDecompressedBytes: 128,
    kvConcurrency: 2,
    kvTimeoutMs: 1000,
    maxDocBytes: 1000,
    maxInflight: 1,
    connstr: 'couchbase://localhost',
    username: 'ingest',
    password: 'secret',
    wanProfile: false,
    bucket: 'otel',
    scope: 'default',
    ttl: {
      otel_logs: 1,
      otel_traces: 1,
      otel_metrics_gauge: 1,
      otel_metrics_sum: 1,
      otel_metrics_histogram: 1,
      otel_metrics_exponential_histogram: 1,
      otel_metrics_summary: 1,
      hyperdx_sessions: 1,
    },
    ...partial,
  };
}

function outcome(partial: Partial<WriteOutcome> = {}): WriteOutcome {
  return { written: 0, expired: 0, rejected: [], retriable: false, ...partial };
}

async function listen(
  app: ReturnType<typeof createIngestApp>,
): Promise<number> {
  await new Promise<void>(resolve => {
    app.server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = app.server.address();
  if (address == null || typeof address === 'string')
    throw new Error('no port');
  return address.port;
}

function call(
  port: number,
  method: string,
  path: string,
  opts: {
    token?: string;
    body?: Buffer | string;
    headers?: Record<string, string>;
  } = {},
): Promise<{
  status: number;
  body: string;
  headers: Record<string, string | string[] | undefined>;
}> {
  return new Promise((resolve, reject) => {
    const payload = opts.body == null ? undefined : Buffer.from(opts.body);
    const req = request(
      {
        host: '127.0.0.1',
        port,
        method,
        path,
        headers: {
          ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
          ...(payload ? { 'content-length': payload.length } : {}),
          ...opts.headers,
        },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(Buffer.from(chunk)));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
            headers: res.headers,
          }),
        );
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('ingest server', () => {
  const servers: ReturnType<typeof createIngestApp>[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        app =>
          new Promise<void>(resolve => {
            app.server.close(() => resolve());
          }),
      ),
    );
  });

  function start(writer: IngestWriter, partial: Partial<IngestConfig> = {}) {
    const app = createIngestApp({
      config: config(partial),
      writer,
      ready: () => true,
    });
    servers.push(app);
    return listen(app);
  }

  it('requires a bearer token and rejects the wrong media type', async () => {
    const port = await start({ write: async () => outcome({ written: 1 }) });
    expect((await call(port, 'POST', '/v1/logs', { body: '{}' })).status).toBe(
      401,
    );
    expect(
      (
        await call(port, 'POST', '/v1/logs', {
          token: 'short-token-value-not-the-real-one!!',
          body: '{}',
          headers: { 'content-type': 'application/json' },
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await call(port, 'POST', '/v1/logs', {
          token: TOKEN,
          body: '{}',
          headers: { 'content-type': 'application/x-protobuf' },
        })
      ).status,
    ).toBe(415);
    expect(
      (
        await call(port, 'POST', '/v1/logs', {
          token: TOKEN,
          body: '{}',
          headers: {
            'content-type': 'application/json',
            'content-encoding': 'deflate',
          },
        })
      ).status,
    ).toBe(415);
  });

  it('rejects oversized and invalid gzip bodies', async () => {
    const port = await start({ write: async () => outcome() });
    const big = await call(port, 'POST', '/v1/logs', {
      token: TOKEN,
      body: 'x'.repeat(80),
      headers: { 'content-type': 'application/json' },
    });
    expect(big.status).toBe(413);
    const bad = await call(port, 'POST', '/v1/logs', {
      token: TOKEN,
      body: Buffer.from('not-gzip'),
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip',
      },
    });
    expect(bad.status).toBe(400);
  });

  it('returns partial success and 503 for a retriable write', async () => {
    const port = await start(
      {
        write: async (docs: Doc[]) =>
          docs[0]?.value.Body === 'retry'
            ? outcome({ retriable: true, error: 'down' })
            : outcome({ written: 1 }),
      },
      { maxBodyBytes: 1_000_000, maxDecompressedBytes: 1_000_000 },
    );
    const partial = await call(port, 'POST', '/v1/metrics', {
      token: TOKEN,
      body: JSON.stringify({
        resourceMetrics: [{ scopeMetrics: [{ metrics: [{ name: 'x' }] }] }],
      }),
      headers: { 'content-type': 'application/json' },
    });
    expect(partial.status).toBe(200);
    expect(JSON.parse(partial.body).partialSuccess.rejectedDataPoints).toBe(1);
    const gzipped = gzipSync(
      Buffer.from(
        JSON.stringify({
          resourceLogs: [
            {
              scopeLogs: [
                {
                  logRecords: [
                    { body: { stringValue: 'retry' }, timeUnixNano: '1' },
                  ],
                },
              ],
            },
          ],
        }),
      ),
    );
    const retry = await call(port, 'POST', '/v1/logs', {
      token: TOKEN,
      body: gzipped,
      headers: {
        'content-type': 'application/json',
        'content-encoding': 'gzip',
      },
    });
    expect(retry.status).toBe(503);
    expect(retry.headers['retry-after']).toBe('5');
  });

  it('returns 503 when the in-flight limit is reached', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const port = await start({
      write: () => gate.then(() => outcome({ written: 1 })),
    });
    const first = call(port, 'POST', '/v1/logs', {
      token: TOKEN,
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    await new Promise(resolve => setTimeout(resolve, 30));
    const second = await call(port, 'POST', '/v1/logs', {
      token: TOKEN,
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    expect(second.status).toBe(503);
    release();
    expect((await first).status).toBe(200);
  });
});
