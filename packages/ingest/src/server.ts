import { createHash, timingSafeEqual } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { gunzipSync } from 'node:zlib';

import type { IngestConfig } from '@/config';
import { SelfMetrics } from '@/selfMetrics';
import type { Doc, TransformResult } from '@/transform/common';
import { transformLogs } from '@/transform/logs';
import { transformMetrics } from '@/transform/metrics';
import { transformSessions } from '@/transform/sessions';
import { transformTraces } from '@/transform/traces';
import type { WriteOutcome } from '@/writer';

export type IngestWriter = {
  write(docs: Doc[]): Promise<WriteOutcome>;
};

type Signal = 'logs' | 'traces' | 'metrics' | 'sessions';

type Route = {
  signal: Signal;
  rejectedField: 'rejectedLogRecords' | 'rejectedSpans' | 'rejectedDataPoints';
  transform: (body: unknown, now: Date) => TransformResult;
};

const ROUTES: Record<string, Route> = {
  '/v1/logs': {
    signal: 'logs',
    rejectedField: 'rejectedLogRecords',
    transform: (body, now) => transformLogs(body as never, now),
  },
  '/v1/sessions': {
    signal: 'sessions',
    rejectedField: 'rejectedLogRecords',
    transform: (body, now) => transformSessions(body as never, now),
  },
  '/v1/traces': {
    signal: 'traces',
    rejectedField: 'rejectedSpans',
    transform: (body, now) => transformTraces(body as never, now),
  },
  '/v1/metrics': {
    signal: 'metrics',
    rejectedField: 'rejectedDataPoints',
    transform: (body, now) => transformMetrics(body as never, now),
  },
};

export type IngestApp = {
  server: ReturnType<typeof createServer>;
  metrics: SelfMetrics;
  inflight: () => number;
};

export function createIngestApp(opts: {
  config: IngestConfig;
  writer: IngestWriter;
  ready: () => boolean | Promise<boolean>;
  now?: () => Date;
}): IngestApp {
  const metrics = new SelfMetrics();
  let inflight = 0;
  const server = createServer((req, res) => {
    const started = Date.now();
    handle(req, res)
      .catch(err => {
        const message = err instanceof Error ? err.message : 'internal error';
        send(res, 500, { error: message });
      })
      .finally(() => {
        const route = req.url?.split('?')[0] ?? '';
        metrics.observe(
          'cbt_ingest_request_duration_seconds',
          { route },
          (Date.now() - started) / 1000,
        );
      });
  });

  async function handle(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const route = (req.url ?? '').split('?')[0];
    const method = req.method ?? 'GET';
    if (route === '/health' && method === 'GET') {
      if (!authorized(req, opts.config.token))
        return send(res, 401, { error: 'unauthorized' });
      const ok = await opts.ready();
      metrics.inc('cbt_ingest_requests_total', {
        route,
        status: ok ? '200' : '503',
      });
      return send(
        res,
        ok ? 200 : 503,
        ok ? { status: 'ok' } : { status: 'unavailable' },
      );
    }
    if (route === '/metrics' && method === 'GET') {
      if (!authorized(req, opts.config.token))
        return send(res, 401, { error: 'unauthorized' });
      metrics.inc('cbt_ingest_requests_total', { route, status: '200' });
      res.writeHead(200, {
        'content-type': 'text/plain; version=0.0.4; charset=utf-8',
      });
      res.end(metrics.render());
      return;
    }
    const spec = ROUTES[route];
    if (!spec) {
      const known = Object.prototype.hasOwnProperty.call(ROUTES, route);
      const status = known ? 405 : 404;
      metrics.inc('cbt_ingest_requests_total', {
        route,
        status: String(status),
      });
      return send(res, status, {
        error: status === 405 ? 'method not allowed' : 'not found',
      });
    }
    if (method !== 'POST') {
      metrics.inc('cbt_ingest_requests_total', { route, status: '405' });
      return send(res, 405, { error: 'method not allowed' });
    }
    if (!authorized(req, opts.config.token)) {
      metrics.inc('cbt_ingest_requests_total', { route, status: '401' });
      return send(res, 401, { error: 'unauthorized' });
    }
    if (inflight >= opts.config.maxInflight) {
      metrics.inc('cbt_ingest_requests_total', { route, status: '503' });
      res.setHeader('retry-after', '5');
      return send(res, 503, { error: 'too many requests' });
    }
    if (!isJson(req.headers['content-type'])) {
      metrics.inc('cbt_ingest_requests_total', { route, status: '415' });
      return send(res, 415, { error: 'content type must be application/json' });
    }
    const encoding = req.headers['content-encoding'];
    if (encoding != null && encoding !== '' && encoding !== 'gzip') {
      metrics.inc('cbt_ingest_requests_total', { route, status: '415' });
      return send(res, 415, { error: 'content encoding must be gzip' });
    }
    inflight += 1;
    try {
      const body = await readBody(req, opts.config.maxBodyBytes);
      let jsonText: Buffer;
      if (encoding === 'gzip') {
        try {
          jsonText = gunzipSync(body, {
            maxOutputLength: opts.config.maxDecompressedBytes,
          });
        } catch (err) {
          const tooBig =
            err instanceof RangeError ||
            (err instanceof Error &&
              /maxOutputLength|uncompressed/i.test(err.message));
          const status = tooBig ? 413 : 400;
          metrics.inc('cbt_ingest_requests_total', {
            route,
            status: String(status),
          });
          return send(res, status, {
            error: tooBig ? 'decompressed body too large' : 'invalid gzip',
          });
        }
      } else {
        jsonText = body;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText.toString('utf8'));
      } catch {
        metrics.inc('cbt_ingest_requests_total', { route, status: '400' });
        return send(res, 400, { error: 'invalid json' });
      }
      const now = opts.now?.() ?? new Date();
      const transformed = spec.transform(parsed, now);
      if (transformed.timestampDefaulted > 0) {
        metrics.inc(
          'cbt_ingest_timestamp_defaulted_total',
          { signal: spec.signal },
          transformed.timestampDefaulted,
        );
      }
      const outcome = await opts.writer.write(transformed.docs);
      recordOutcome(metrics, spec.signal, transformed, outcome);
      if (outcome.retriable) {
        metrics.inc('cbt_ingest_requests_total', { route, status: '503' });
        res.setHeader('retry-after', '5');
        return send(res, 503, { error: outcome.error ?? 'retry' });
      }
      const rejected = rejectedCount(transformed) + outcome.rejected.length;
      if (rejected > 0) {
        metrics.inc('cbt_ingest_requests_total', { route, status: '200' });
        return send(res, 200, {
          partialSuccess: {
            [spec.rejectedField]: rejected,
            errorMessage: summarize(transformed, outcome),
          },
        });
      }
      metrics.inc('cbt_ingest_requests_total', { route, status: '200' });
      return send(res, 200, {});
    } catch (err) {
      if (err instanceof BodyTooLarge) {
        metrics.inc('cbt_ingest_requests_total', { route, status: '413' });
        return send(res, 413, { error: 'body too large' });
      }
      metrics.inc('cbt_ingest_requests_total', { route, status: '503' });
      res.setHeader('retry-after', '5');
      return send(res, 503, {
        error: err instanceof Error ? err.message : 'retry',
      });
    } finally {
      inflight -= 1;
    }
  }

  return { server, metrics, inflight: () => inflight };
}

class BodyTooLarge extends Error {}

function authorized(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? '';
  const expected = `Bearer ${token}`;
  const a = createHash('sha256').update(header).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function isJson(header: string | undefined): boolean {
  if (!header) return false;
  return header.split(';')[0].trim().toLowerCase() === 'application/json';
}

async function readBody(req: IncomingMessage, max: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (Number.isFinite(declared) && declared > max) throw new BodyTooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > max) throw new BodyTooLarge();
    chunks.push(buf);
  }
  return Buffer.concat(chunks);
}

function rejectedCount(result: TransformResult): number {
  return result.rejected.reduce((sum, item) => sum + item.count, 0);
}

function summarize(result: TransformResult, outcome: WriteOutcome): string {
  const parts = result.rejected.map(item => `${item.reason}=${item.count}`);
  if (outcome.rejected.length > 0) {
    const counts = new Map<string, number>();
    for (const item of outcome.rejected) {
      counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
    }
    for (const [reason, count] of counts) parts.push(`${reason}=${count}`);
  }
  return parts.join(', ');
}

function recordOutcome(
  metrics: SelfMetrics,
  signal: Signal,
  result: TransformResult,
  outcome: WriteOutcome,
): void {
  metrics.inc(
    'cbt_ingest_records_total',
    { signal, outcome: 'written' },
    outcome.written,
  );
  metrics.inc(
    'cbt_ingest_records_total',
    { signal, outcome: 'expired' },
    outcome.expired,
  );
  const rejected = rejectedCount(result) + outcome.rejected.length;
  metrics.inc(
    'cbt_ingest_records_total',
    { signal, outcome: 'rejected' },
    rejected,
  );
  if (outcome.retriable) {
    const failed = Math.max(
      0,
      result.docs.length -
        outcome.written -
        outcome.expired -
        outcome.rejected.length,
    );
    metrics.inc(
      'cbt_ingest_records_total',
      { signal, outcome: 'failed' },
      failed,
    );
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  if (res.headersSent) return;
  const json = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(json);
}
