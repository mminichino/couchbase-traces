import { existsSync } from 'node:fs';

import { dnsConfig } from '@couchbase-traces/common-utils/dist/couchbase/dnsConfig';
import { type Cluster, connect, type ConnectOptions } from 'couchbase';

import type { CollectionName } from '@/model/collections';
import { COLLECTIONS } from '@/model/collections';
import { resolveTtlMs, type TtlEnvName } from '@/ttl';

export type IngestConfig = {
  port: number;
  host: string;
  token: string;
  maxBodyBytes: number;
  maxDecompressedBytes: number;
  kvConcurrency: number;
  kvTimeoutMs: number;
  maxDocBytes: number;
  maxInflight: number;
  connstr: string;
  username: string;
  password: string;
  wanProfile: boolean;
  caCertPath?: string;
  bucket: string;
  scope: string;
  ttl: Record<CollectionName, number>;
};

const REQUIRED = [
  'CBT_INGEST_TOKEN',
  'CBT_COUCHBASE_CONNSTR',
  'CBT_COUCHBASE_INGEST_USER',
  'CBT_COUCHBASE_INGEST_PASSWORD',
] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): IngestConfig {
  for (const name of REQUIRED) {
    const value = env[name];
    if (value == null || value === '') {
      throw new Error(`${name} is required`);
    }
  }
  const token = env.CBT_INGEST_TOKEN ?? '';
  if (token.length < 32) {
    throw new Error('CBT_INGEST_TOKEN must be at least 32 characters');
  }
  const connstr = env.CBT_COUCHBASE_CONNSTR ?? '';
  return {
    port: intEnv(env, 'CBT_INGEST_PORT', 4320),
    host: env.CBT_INGEST_HOST || '0.0.0.0',
    token,
    maxBodyBytes: intEnv(env, 'CBT_INGEST_MAX_BODY_BYTES', 16_777_216),
    maxDecompressedBytes: intEnv(
      env,
      'CBT_INGEST_MAX_DECOMPRESSED_BYTES',
      134_217_728,
    ),
    kvConcurrency: intEnv(env, 'CBT_INGEST_KV_CONCURRENCY', 256),
    kvTimeoutMs: intEnv(env, 'CBT_INGEST_KV_TIMEOUT_MS', 10_000),
    maxDocBytes: intEnv(env, 'CBT_INGEST_MAX_DOC_BYTES', 20_970_496),
    maxInflight: intEnv(env, 'CBT_INGEST_MAX_INFLIGHT_REQUESTS', 64),
    connstr,
    username: env.CBT_COUCHBASE_INGEST_USER ?? '',
    password: env.CBT_COUCHBASE_INGEST_PASSWORD ?? '',
    wanProfile: wanProfile(connstr, env.CBT_COUCHBASE_WAN_PROFILE),
    caCertPath: caPath(env.CBT_COUCHBASE_CA_CERT_PATH),
    bucket: env.CBT_COUCHBASE_BUCKET || 'otel',
    scope: env.CBT_COUCHBASE_SCOPE || 'default',
    ttl: {
      otel_logs: resolveTtlMs(env, 'CBT_LOGS_TTL'),
      otel_traces: resolveTtlMs(env, 'CBT_TRACES_TTL'),
      otel_metrics_gauge: resolveTtlMs(env, 'CBT_METRICS_TTL'),
      otel_metrics_sum: resolveTtlMs(env, 'CBT_METRICS_TTL'),
      otel_metrics_histogram: resolveTtlMs(env, 'CBT_METRICS_TTL'),
      otel_metrics_exponential_histogram: resolveTtlMs(env, 'CBT_METRICS_TTL'),
      otel_metrics_summary: resolveTtlMs(env, 'CBT_METRICS_TTL'),
      otel_sessions: resolveTtlMs(env, 'CBT_SESSIONS_TTL'),
    },
  };
}

function intEnv(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const raw = env[name];
  if (raw == null || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be a positive integer`);
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return n;
}

/** Explicit `true`/`false`, otherwise `couchbases://` selects the WAN profile. */
export function wanProfile(
  connstr: string,
  explicit: string | undefined,
): boolean {
  if (explicit === 'true') return true;
  if (explicit === 'false') return false;
  if (explicit != null && explicit !== '') {
    throw new Error('CBT_COUCHBASE_WAN_PROFILE must be true or false');
  }
  return connstr.toLowerCase().startsWith('couchbases://');
}

export function isCapella(connstr: string): boolean {
  return connstr.toLowerCase().includes('.cloud.couchbase.com');
}

function caPath(path: string | undefined): string | undefined {
  if (path == null || path === '') return undefined;
  if (!existsSync(path)) {
    throw new Error(`CBT_COUCHBASE_CA_CERT_PATH does not exist: ${path}`);
  }
  return path;
}

export async function connectCluster(config: IngestConfig): Promise<Cluster> {
  const options: ConnectOptions = {
    username: config.username,
    password: config.password,
    timeouts: { connectTimeout: 10_000 },
    dnsConfig: dnsConfig(),
  };
  if (config.wanProfile) options.configProfile = 'wanDevelopment';
  if (config.caCertPath)
    options.security = { trustStorePath: config.caCertPath };
  return connect(config.connstr, options);
}

export const TTL_ENVS: TtlEnvName[] = [
  'CBT_LOGS_TTL',
  'CBT_TRACES_TTL',
  'CBT_METRICS_TTL',
  'CBT_SESSIONS_TTL',
];

export function ttlByCollection(
  env: NodeJS.ProcessEnv,
): Record<CollectionName, number> {
  const metrics = resolveTtlMs(env, 'CBT_METRICS_TTL');
  const out = {} as Record<CollectionName, number>;
  for (const spec of COLLECTIONS) {
    out[spec.name] =
      spec.ttlEnv === 'CBT_METRICS_TTL'
        ? metrics
        : resolveTtlMs(env, spec.ttlEnv);
  }
  return out;
}
