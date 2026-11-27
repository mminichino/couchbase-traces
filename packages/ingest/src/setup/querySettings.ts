import { readFileSync } from 'node:fs';
// Named imports: a default import makes tsc emit a tslib helper
// (importHelpers), and the ingest image ships no tslib.
import { type IncomingMessage, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import { managementBaseUrl } from '@couchbase-traces/common-utils/dist/couchbase/management';

import { SetupError } from '@/setup/errors';

/**
 * Cluster-wide completed-requests settings (P13, docs/v1-release-plan.md 2.3).
 * `system:completed_requests` keeps only requests slower than the threshold,
 * so fast attributed queries are invisible unless an operator lowers it.
 */
export type CompletedSettings = {
  completedThresholdMs?: number;
  completedLimit?: number;
};

const KEYS = {
  completedThresholdMs: 'queryCompletedThreshold',
  completedLimit: 'queryCompletedLimit',
} as const;

const ENV = {
  completedThresholdMs: 'CBT_COUCHBASE_COMPLETED_THRESHOLD_MS',
  completedLimit: 'CBT_COUCHBASE_COMPLETED_LIMIT',
} as const;

// Both settings are int32 in the 8.0 REST reference.
const INT32_MAX = 2_147_483_647;

/** Reads both variables; unset or empty means "leave the cluster as is". */
export function parseCompletedSettings(
  env: NodeJS.ProcessEnv,
): CompletedSettings {
  const out: CompletedSettings = {};
  for (const field of Object.keys(ENV) as (keyof typeof ENV)[]) {
    const name = ENV[field];
    const raw = env[name]?.trim();
    if (raw == null || raw === '') continue;
    if (!/^-?\d+$/.test(raw)) {
      throw new SetupError(`${name} must be an integer`, 1);
    }
    const value = Number(raw);
    if (value < -1 || value > INT32_MAX) {
      throw new SetupError(`${name} must be between -1 and ${INT32_MAX}`, 1);
    }
    out[field] = value;
  }
  return out;
}

export type MgmtRequest = {
  method: 'GET' | 'POST';
  url: string;
  username: string;
  password: string;
  body?: Record<string, number>;
};

export type MgmtResponse = { status: number; body: string };

export type MgmtHttp = (req: MgmtRequest) => Promise<MgmtResponse>;

/**
 * Management REST origin for the setup connection string: 8091, or 18091 for
 * `couchbases://`, on the first host. `CBT_COUCHBASE_MGMT_PORT` overrides the
 * port, as it does for `docker/couchbase/init.sh`.
 */
export function managementUrl(connstr: string, env: NodeJS.ProcessEnv): string {
  const rawPort = env.CBT_COUCHBASE_MGMT_PORT?.trim();
  let port: number | undefined;
  if (rawPort) {
    port = Number(rawPort);
    if (!/^\d+$/.test(rawPort) || port < 1 || port > 65535) {
      throw new SetupError('CBT_COUCHBASE_MGMT_PORT must be a TCP port', 1);
    }
  }
  return managementBaseUrl({
    id: 'setup',
    host: connstr,
    username: '',
    updatedAt: '',
    managementPort: port,
  }).url;
}

/** `setup --dry-run` never connects: list what would be set, if it differs. */
export function querySettingsDryRun(
  wanted: CompletedSettings,
  capella: boolean,
  log: (line: string) => void,
): void {
  const keys = wantedKeys(wanted);
  if (keys.length === 0) log('skipped query settings (unset)');
  else if (capella) log('skipped query settings (Capella)');
  else
    log(
      `would set query settings if different: ${keys.map(([k, v]) => `${k}=${v}`).join(', ')}`,
    );
}

/** Node HTTP(S) client; trusts `caPath` in addition to the system CAs. */
export function nodeMgmtHttp(caPath?: string): MgmtHttp {
  const ca = caPath ? readFileSync(caPath, 'utf8') : undefined;
  return req =>
    new Promise((resolve, reject) => {
      const url = new URL(req.url);
      // ns_server answers a JSON body with 400 "Request should have
      // parameters" although the 8.0 reference lists application/json; the
      // reference's own curl example sends a form, which it accepts.
      const payload = req.body
        ? new URLSearchParams(
            Object.entries(req.body).map(([k, v]) => [k, String(v)]),
          ).toString()
        : undefined;
      const headers: Record<string, string> = {
        authorization: `Basic ${Buffer.from(`${req.username}:${req.password}`).toString('base64')}`,
        accept: 'application/json',
      };
      if (payload) {
        headers['content-type'] = 'application/x-www-form-urlencoded';
        headers['content-length'] = String(Buffer.byteLength(payload));
      }
      const options = { method: req.method, headers, timeout: 10_000 };
      const handle = (res: IncomingMessage) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
        res.on('error', reject);
      };
      const request =
        url.protocol === 'https:'
          ? httpsRequest(url, { ...options, ...(ca ? { ca } : {}) }, handle)
          : httpRequest(url, options, handle);
      request.on('timeout', () =>
        request.destroy(new Error('management request timed out')),
      );
      request.on('error', reject);
      if (payload) request.write(payload);
      request.end();
    });
}

export type EnsureQuerySettingsResult = {
  changed: string[];
  skipped?: 'unset' | 'capella' | 'forbidden' | 'unreachable';
};

/**
 * Reads `GET /settings/querySettings` and writes only the keys that differ,
 * so a re-run with the same values makes no write. With `dryRun` it reports
 * the keys it would change and never writes. A 403 (no Full Admin or Cluster
 * Admin) or an unreachable management port is a warning: these settings are
 * observability only and must not fail setup.
 */
export async function ensureQuerySettings(opts: {
  mgmtUrl: string;
  username: string;
  password: string;
  wanted: CompletedSettings;
  dryRun: boolean;
  capella: boolean;
  http: MgmtHttp;
  log: (line: string) => void;
}): Promise<EnsureQuerySettingsResult> {
  const wanted = wantedKeys(opts.wanted);
  if (wanted.length === 0) {
    opts.log('skipped query settings (unset)');
    return { changed: [], skipped: 'unset' };
  }
  if (opts.capella) {
    opts.log(
      `skipped query settings (Capella: set ${wanted.map(([k, v]) => `${k}=${v}`).join(', ')} in the Capella UI or through Couchbase support)`,
    );
    return { changed: [], skipped: 'capella' };
  }
  const url = `${opts.mgmtUrl}/settings/querySettings`;
  const auth = { username: opts.username, password: opts.password };

  const current = await call(opts, { method: 'GET', url, ...auth });
  if ('skipped' in current) return { changed: [], skipped: current.skipped };
  const settings = parseSettings(current.body);
  const diff = wanted.filter(([key, value]) => settings[key] !== value);
  if (diff.length === 0) {
    opts.log('exists query settings (no change)');
    return { changed: [] };
  }
  const describe = diff
    .map(([key, value]) => `${key} ${String(settings[key])} -> ${value}`)
    .join(', ');
  if (opts.dryRun) {
    opts.log(`would update query settings: ${describe}`);
    return { changed: diff.map(([key]) => key) };
  }
  const written = await call(opts, {
    method: 'POST',
    url,
    ...auth,
    body: Object.fromEntries(diff),
  });
  if ('skipped' in written) return { changed: [], skipped: written.skipped };
  opts.log(`updated query settings: ${describe}`);
  return { changed: diff.map(([key]) => key) };
}

function wantedKeys(wanted: CompletedSettings): [string, number][] {
  const out: [string, number][] = [];
  for (const field of Object.keys(KEYS) as (keyof typeof KEYS)[]) {
    const value = wanted[field];
    if (value != null) out.push([KEYS[field], value]);
  }
  return out;
}

function parseSettings(body: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed != null && typeof parsed === 'object') {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Reported below.
  }
  throw new SetupError('query settings response is not a JSON object', 5);
}

async function call(
  opts: { http: MgmtHttp; log: (line: string) => void },
  req: MgmtRequest,
): Promise<MgmtResponse | { skipped: 'forbidden' | 'unreachable' }> {
  let res: MgmtResponse;
  try {
    res = await opts.http(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    opts.log(
      `warning: skipped query settings: management REST API unreachable (${message}); set CBT_COUCHBASE_MGMT_PORT if it is not on the default port`,
    );
    return { skipped: 'unreachable' };
  }
  if (res.status === 403) {
    opts.log(
      'warning: skipped query settings: the setup user needs the Full Admin or Cluster Admin role to change cluster query settings',
    );
    return { skipped: 'forbidden' };
  }
  if (res.status < 200 || res.status >= 300) {
    throw new SetupError(
      `query settings ${req.method} failed: HTTP ${res.status} ${res.body.slice(0, 500)}`,
      res.status === 400 ? 1 : 5,
    );
  }
  return res;
}
