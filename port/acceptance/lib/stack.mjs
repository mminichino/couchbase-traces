import { execFileSync, spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

export const PROJECT_NAME = 'cbt-acceptance';
export const PORT_OFFSET = 10000;

/**
 * @param {number} n
 * @returns {string}
 */
function randomSecret(n) {
  const alphabet =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const bytes = randomBytes(n);
  let out = '';
  for (let i = 0; i < n; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/**
 * Build env for the acceptance product stack from .env.example + generated secrets.
 * Ports are offset by PORT_OFFSET.
 * @param {string} root
 * @returns {{ envFile: string, env: Record<string,string>, cleanup: () => void }}
 */
export function prepareProductEnv(root) {
  const example = readFileSync(join(root, '.env.example'), 'utf8');
  /** @type {Record<string,string>} */
  const env = {};
  for (const line of example.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }

  env.CBT_COUCHBASE_ADMIN_PASSWORD = randomSecret(24);
  env.CBT_COUCHBASE_QUERY_PASSWORD = randomSecret(24);
  env.CBT_COUCHBASE_INGEST_PASSWORD = randomSecret(24);
  env.CBT_COUCHBASE_MONITOR_PASSWORD = randomSecret(24);
  env.CBT_INGEST_TOKEN = randomSecret(48);
  env.CBT_API_KEY = randomSecret(32);
  env.EXPRESS_SESSION_SECRET = randomSecret(48);
  env.TOKEN_ENCRYPTION_KEY = randomBytes(32).toString('base64');

  // Keep in-container listen ports at product defaults (8000/8080/4320) so
  // image HEALTHCHECKs and OpAMP wiring stay valid. Host publishes are remapped
  // in docker-compose.observe.yml (+PORT_OFFSET).
  env.CBT_API_PORT = String(env.CBT_API_PORT || 8000);
  env.CBT_APP_PORT = String(env.CBT_APP_PORT || 8080);
  env.CBT_OPAMP_PORT = String(env.CBT_OPAMP_PORT || 4320);
  env.CBT_APP_URL = env.CBT_APP_URL || 'http://localhost';
  // Browser-facing URL uses the host-mapped app port.
  env.CBT_ACCEPT_HOST_APP_PORT = String(
    Number(env.CBT_APP_PORT) + PORT_OFFSET,
  );
  env.CBT_ACCEPT_HOST_API_PORT = String(
    Number(env.CBT_API_PORT) + PORT_OFFSET,
  );
  env.WEBHOOK_HOSTNAME_ALLOWLIST = 'webhook';

  const dir = mkdtempSync(join(tmpdir(), 'cbt-accept-env-'));
  const envFile = join(dir, '.env');
  writeFileSync(
    envFile,
    Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n') + '\n',
  );
  return {
    envFile,
    env,
    cleanup: () => {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}

/**
 * @returns {boolean}
 */
export function dockerAvailable() {
  const r = spawnSync('docker', ['info'], { encoding: 'utf8' });
  return r.status === 0;
}

/**
 * @param {string} root
 * @param {string[]} args
 * @param {object} [opts]
 */
export function compose(root, args, opts = {}) {
  const base = [
    'compose',
    '-p',
    PROJECT_NAME,
    '-f',
    'docker-compose.yml',
    '-f',
    'port/acceptance/docker-compose.observe.yml',
  ];
  if (opts.envFile) {
    base.push('--env-file', opts.envFile);
  }
  return spawnSync('docker', [...base, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...(opts.env || {}) },
    maxBuffer: 20 * 1024 * 1024,
  });
}

/**
 * Clear acceptance project volumes under .volumes/cbt-acceptance if present.
 * Never touches the developer's default .volumes/.
 * @param {string} root
 */
export function clearAcceptanceVolumes(root) {
  const dir = join(root, '.volumes', PROJECT_NAME);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
  mkdirSync(dir, { recursive: true });
}

/**
 * @param {string} root
 * @param {{ envFile: string, keepStack?: boolean, reuseStack?: boolean, evidenceDir: string, log: (s:string)=>void }} opts
 */
export async function upProductStack(root, opts) {
  if (!dockerAvailable()) {
    const err = new Error('Docker is not running or docker compose is missing');
    /** @type {any} */ (err).runnerError = true;
    throw err;
  }
  if (!opts.reuseStack) {
    clearAcceptanceVolumes(root);
    opts.log('Starting product stack (cbt-acceptance)...');
    const up = compose(
      root,
      ['up', '-d', '--build'],
      { envFile: opts.envFile },
    );
    writeFileSync(
      join(opts.evidenceDir, 'compose-up.log'),
      `${up.stdout}\n${up.stderr}`,
    );
    // Compose may exit non-zero when a dependent service is still unhealthy;
    // continue into the health wait so couchbase-init/app/ingest can recover.
    if (up.status !== 0) {
      opts.log(
        `compose up exited ${up.status}; waiting for services to become healthy`,
      );
    }
  }
  const deadline = Date.now() + 600_000;
  let healthy = false;
  let psOut = '';
  while (Date.now() < deadline) {
    const ps = compose(root, ['ps'], { envFile: opts.envFile });
    psOut = `${ps.stdout}\n${ps.stderr}`;
    const init = compose(root, ['ps', '-a', 'couchbase-init'], {
      envFile: opts.envFile,
    });
    const initOut = `${init.stdout}\n${init.stderr}`;
    const initDone =
      /exited \(0\)/i.test(initOut) ||
      /Exit 0/i.test(initOut) ||
      /exited \(0\)/i.test(psOut);
    const appOk = /app\s+.*\s+\(healthy\)/i.test(psOut) || /app.*running/i.test(psOut);
    const ingestOk =
      /ingest\s+.*\s+\(healthy\)/i.test(psOut) || /ingest.*running/i.test(psOut);
    const otelOk =
      /otel-collector/i.test(psOut) &&
      (/healthy/i.test(psOut) || /running/i.test(psOut));
    if (initDone && appOk && ingestOk && otelOk) {
      healthy = true;
      break;
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  const initLogs = compose(root, ['logs', 'couchbase-init'], {
    envFile: opts.envFile,
  });
  writeFileSync(join(opts.evidenceDir, 'compose-ps.txt'), psOut);
  writeFileSync(
    join(opts.evidenceDir, 'couchbase-init.log'),
    `${initLogs.stdout}\n${initLogs.stderr}`,
  );
  return {
    ok: healthy,
    logs: `${initLogs.stdout}\n${initLogs.stderr}`,
    ps: psOut,
  };
}

/**
 * @param {string} root
 * @param {{ envFile?: string, keepStack?: boolean }} opts
 */
export function downProductStack(root, opts = {}) {
  if (opts.keepStack) return;
  if (!dockerAvailable()) return;
  compose(root, ['down', '-v'], { envFile: opts.envFile });
}

/**
 * @returns {{ dockerVersion: string, dockerCpus: number, dockerMemoryBytes: number }}
 */
export function dockerResources() {
  if (!dockerAvailable()) {
    return { dockerVersion: 'unavailable', dockerCpus: 0, dockerMemoryBytes: 0 };
  }
  let dockerVersion = 'unknown';
  try {
    dockerVersion = execFileSync('docker', ['version', '--format', '{{.Server.Version}}'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    // ignore
  }
  let dockerCpus = 0;
  let dockerMemoryBytes = 0;
  try {
    const info = JSON.parse(
      execFileSync('docker', ['info', '--format', '{{json .}}'], {
        encoding: 'utf8',
        maxBuffer: 5 * 1024 * 1024,
      }),
    );
    dockerCpus = Number(info.NCPU) || 0;
    dockerMemoryBytes = Number(info.MemTotal) || 0;
  } catch {
    // ignore
  }
  return { dockerVersion, dockerCpus, dockerMemoryBytes };
}
