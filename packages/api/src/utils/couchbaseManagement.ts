import http from 'node:http';
import https from 'node:https';

import {
  ConnStrError,
  parseConnStr,
} from '@couchbase-traces/common-utils/dist/couchbase/connstr';

import { IPV6_BRACKET_RE, isPrivateIp } from '@/utils/validators';

export type SectionDetail = {
  httpStatus?: number;
  code?: string;
  message: string;
};

export type ManagementResult =
  | { ok: true; json: unknown }
  | { ok: false; detail: SectionDetail };

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;

export type ManagementCall = {
  url: string;
  username: string;
  password: string;
  ca?: string;
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
  maxBytes?: number;
};

function readCode(err: unknown): string {
  if (err != null && typeof err === 'object' && 'code' in err) {
    const code = Reflect.get(err, 'code');
    if (typeof code === 'string') return code;
  }
  return '';
}

/** Network failures become a detail that never includes the URL or credentials. */
export function classifyManagementError(err: unknown): SectionDetail {
  const code = readCode(err);
  const message = err instanceof Error ? err.message : '';
  const blob = `${code} ${message}`;
  if (
    code === 'TIMEOUT' ||
    code === 'ETIMEDOUT' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'ECONNABORTED'
  ) {
    return { code: 'timeout', message: 'Timed out' };
  }
  if (code === 'ECONNREFUSED') {
    return { code: 'connection_refused', message: 'Connection refused' };
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return { code: 'dns', message: 'Could not resolve host' };
  }
  if (/TLS|CERT|UNABLE_TO_VERIFY|SELF_SIGNED|ERR_SSL/i.test(blob)) {
    return { code: 'tls', message: 'TLS verification failed' };
  }
  return { code: code || 'network', message: 'Request failed' };
}

/** Same rejection as the connection test: a private IP literal is not called. */
export function managementHostProblem(host: string): string | null {
  try {
    const parsed = parseConnStr(host);
    if (
      parsed.hosts.some(entry =>
        isPrivateIp(entry.host.replace(IPV6_BRACKET_RE, '')),
      )
    ) {
      return 'Invalid host';
    }
    return null;
  } catch (err) {
    const message =
      err instanceof ConnStrError ? err.message : 'Invalid connection string';
    if (/couchbases?:\/\//i.test(message) || /https?:\/\//i.test(message)) {
      return 'Invalid connection string';
    }
    return message;
  }
}

/**
 * One management request. Basic auth, a 5s timeout, a 5 MB body limit, and no
 * redirects. The error detail never contains the credential or the URL.
 */
export function managementCall(
  args: ManagementCall,
): Promise<ManagementResult> {
  const method = args.method ?? 'GET';
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = args.maxBytes ?? DEFAULT_MAX_BYTES;
  let target: URL;
  try {
    target = new URL(args.url);
  } catch {
    return Promise.resolve({
      ok: false,
      detail: { code: 'invalid_url', message: 'Invalid management URL' },
    });
  }
  const lib = target.protocol === 'https:' ? https : http;
  const payload =
    args.body === undefined ? null : Buffer.from(JSON.stringify(args.body));
  const authorization = Buffer.from(
    `${args.username}:${args.password}`,
    'utf8',
  ).toString('base64');

  return new Promise(resolve => {
    let settled = false;
    const finish = (result: ManagementResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method,
        headers: {
          Authorization: `Basic ${authorization}`,
          Accept: 'application/json',
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': payload.length,
              }
            : {}),
        },
        timeout: timeoutMs,
        ca: args.ca,
        rejectUnauthorized: true,
      },
      res => {
        const status = res.statusCode ?? 500;
        if (status >= 300 && status < 400) {
          res.resume();
          finish({
            ok: false,
            detail: {
              httpStatus: status,
              code: 'redirect',
              message: 'Redirects are not followed',
            },
          });
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        let tooBig = false;
        res.on('data', (chunk: Buffer) => {
          if (tooBig) return;
          size += chunk.length;
          if (size > maxBytes) {
            tooBig = true;
            res.destroy();
            finish({
              ok: false,
              detail: {
                code: 'response_too_large',
                message: 'Response exceeds 5 MB',
              },
            });
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          if (tooBig) return;
          const text = Buffer.concat(chunks).toString('utf8');
          if (status >= 400) {
            finish({
              ok: false,
              detail: { httpStatus: status, message: `HTTP ${status}` },
            });
            return;
          }
          if (text.trim() === '') {
            finish({ ok: true, json: null });
            return;
          }
          try {
            const json: unknown = JSON.parse(text);
            finish({ ok: true, json });
          } catch {
            finish({
              ok: false,
              detail: {
                code: 'invalid_response',
                message: 'Response was not JSON',
              },
            });
          }
        });
        res.on('error', err => {
          if (!tooBig)
            finish({ ok: false, detail: classifyManagementError(err) });
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      finish({ ok: false, detail: { code: 'timeout', message: 'Timed out' } });
    });
    req.on('error', err => {
      finish({ ok: false, detail: classifyManagementError(err) });
    });
    if (payload) req.write(payload);
    req.end();
  });
}
