/**
 * Starts the built package in a real Node process against a local OTLP
 * receiver: what the API's preload does. `ci:unit` builds first.
 */
import { execFile } from 'node:child_process';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

const DIST = join(__dirname, '..', '..', 'dist', 'index.js');

type Received = { path: string; auth?: string; body: any };

function receiver(): Promise<{ server: Server; url: string; got: Received[] }> {
  const got: Received[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => {
      got.push({
        path: req.url ?? '',
        auth: req.headers.authorization,
        body: raw ? JSON.parse(raw) : undefined,
      });
      res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    });
  });
  return new Promise(resolve =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        server,
        url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
        got,
      }),
    ),
  );
}

// The child serves one request to itself, logs, flushes, and shuts down.
const SCRIPT = `
const { init, flush, shutdown } = require(${JSON.stringify(DIST)});
init({ apiKey: 'test-key', httpBodyCapture: true, serviceName: 'otel-node-test' });
const http = require('node:http');
const server = http.createServer((req, res) => {
  req.on('data', () => {}).on('end', () => {
    res.setHeader('content-type', 'application/json');
    res.end('{"ok":true,"token":"secret"}');
  });
});
server.listen(0, '127.0.0.1', () => {
  const { port } = server.address();
  const req = http.request({ port, host: '127.0.0.1', method: 'POST', path: '/x',
    headers: { 'content-type': 'application/json' } }, res => {
    res.resume().on('end', async () => {
      console.log('hello from the child');
      server.close();
      await flush();
      await shutdown();
      await shutdown();
      process.stdout.write('done');
    });
  });
  req.end('{"password":"p","a":1}');
});
`;

describe('init in a real process', () => {
  it('exports spans with bodies, console logs, and the api key', async () => {
    const { server, url, got } = await receiver();
    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        execFile(
          process.execPath,
          ['-e', SCRIPT],
          {
            env: {
              PATH: process.env.PATH,
              OTEL_EXPORTER_OTLP_ENDPOINT: url,
              OTEL_EXPORTER_OTLP_PROTOCOL: 'http/json',
              OTEL_METRICS_EXPORTER: 'none',
              // env reads OTEL_SERVICE_NAME; the others only slow the test.
              OTEL_NODE_RESOURCE_DETECTORS: 'env',
            },
            timeout: 30_000,
          },
          (err, out, errOut) =>
            err ? reject(new Error(`${err.message}\n${errOut}`)) : resolve(out),
        );
      });
      expect(stdout).toContain('done');

      expect(got.length).toBeGreaterThan(0);
      for (const r of got) expect(r.auth).toBe('test-key');

      const spans = got
        .filter(r => r.path === '/v1/traces')
        .flatMap(r => r.body.resourceSpans)
        .flatMap((rs: any) => rs.scopeSpans)
        .flatMap((ss: any) => ss.spans);
      const attrs = (span: any) =>
        Object.fromEntries(
          span.attributes.map((a: any) => [a.key, Object.values(a.value)[0]]),
        );
      const serverSpan = spans.find((s: any) => s.kind === 2);
      expect(serverSpan).toBeDefined();
      expect(attrs(serverSpan)).toMatchObject({
        'http.request.body.content': '{"password":"[REDACTED]","a":1}',
        'http.response.body.content': '{"ok":true,"token":"[REDACTED]"}',
      });

      const resource = got.find(r => r.path === '/v1/traces')!.body
        .resourceSpans[0].resource;
      expect(attrs(resource)).toMatchObject({
        'service.name': 'otel-node-test',
        'telemetry.distro.name': 'couchbase-traces-otel-node',
      });

      const logBodies = got
        .filter(r => r.path === '/v1/logs')
        .flatMap(r => r.body.resourceLogs)
        .flatMap((rl: any) => rl.scopeLogs)
        .flatMap((sl: any) => sl.logRecords)
        .map((lr: any) => lr.body?.stringValue);
      expect(logBodies).toContain('hello from the child');
    } finally {
      server.close();
    }
  }, 40_000);

  it('does nothing with OTEL_SDK_DISABLED', async () => {
    const out = await new Promise<string>((resolve, reject) =>
      execFile(
        process.execPath,
        [
          '-e',
          `const m = require(${JSON.stringify(DIST)}); m.init({ apiKey: 'k' });
           m.flush().then(() => m.shutdown()).then(() =>
             process.stdout.write(String(process.env.OTEL_EXPORTER_OTLP_HEADERS)));`,
        ],
        { env: { PATH: process.env.PATH, OTEL_SDK_DISABLED: 'true' } },
        (err, stdout) => (err ? reject(err) : resolve(stdout)),
      ),
    );
    expect(out).toBe('undefined');
  });
});
