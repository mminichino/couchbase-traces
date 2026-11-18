import { METADATA_DEFAULTS } from '@couchbase-traces/common-utils/dist/couchbase/metadataKeyspace';

import { MetadataConfigError } from '@/metadata/errors';

export type MetadataConfig = {
  connstr: string;
  bucket: string;
  scope: string;
  username: string;
  password: string;
  wanProfile: boolean;
  caCertPath?: string;
  /** Transaction durability; `none` only for single-node dev clusters. */
  txDurability: 'majority' | 'none';
  autoProvision: boolean;
  /** How long start() waits for missing indexes before returning. */
  indexWaitMs: number;
  kvTimeoutMs: number;
  queryTimeoutMs: number;
  txTimeoutMs: number;
};

type Env = Record<string, string | undefined>;

// A Map lookup keeps arbitrary env names away from prototype properties.
function read(env: Env, name: string): string | undefined {
  return new Map(Object.entries(env)).get(name);
}

function positiveInt(env: Env, name: string, fallback: number): number {
  const raw = read(env, name);
  if (raw == null || raw === '') return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
    throw new MetadataConfigError(`${name} must be a positive whole number`);
  }
  return Number(raw);
}

function bool(env: Env, name: string, fallback: boolean): boolean {
  const raw = read(env, name);
  if (raw == null || raw === '') return fallback;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  throw new MetadataConfigError(`${name} must be true or false`);
}

export function loadMetadataConfig(env: Env = process.env): MetadataConfig {
  const connstr = env.CBT_METADATA_CONNSTR || env.CBT_COUCHBASE_CONNSTR;
  if (!connstr) {
    throw new MetadataConfigError(
      'CBT_METADATA_CONNSTR (or CBT_COUCHBASE_CONNSTR) is required',
    );
  }
  const username = env.CBT_METADATA_USER;
  const password = env.CBT_METADATA_PASSWORD;
  if (!username) throw new MetadataConfigError('CBT_METADATA_USER is required');
  if (!password) {
    throw new MetadataConfigError('CBT_METADATA_PASSWORD is required');
  }
  const durability = env.CBT_METADATA_TX_DURABILITY || 'majority';
  if (durability !== 'majority' && durability !== 'none') {
    throw new MetadataConfigError(
      'CBT_METADATA_TX_DURABILITY must be majority or none',
    );
  }
  const wanName =
    env.CBT_METADATA_WAN_PROFILE != null
      ? 'CBT_METADATA_WAN_PROFILE'
      : 'CBT_COUCHBASE_WAN_PROFILE';
  return {
    connstr,
    bucket: env.CBT_METADATA_BUCKET || METADATA_DEFAULTS.bucket,
    scope: env.CBT_METADATA_SCOPE || METADATA_DEFAULTS.scope,
    username,
    password,
    wanProfile: bool(
      env,
      wanName,
      connstr.toLowerCase().startsWith('couchbases://'),
    ),
    caCertPath:
      env.CBT_METADATA_CA_CERT_PATH ||
      env.CBT_COUCHBASE_CA_CERT_PATH ||
      undefined,
    txDurability: durability,
    autoProvision: bool(env, 'CBT_METADATA_AUTO_PROVISION', false),
    indexWaitMs: positiveInt(env, 'CBT_METADATA_INDEX_WAIT_MS', 120_000),
    kvTimeoutMs: positiveInt(env, 'CBT_METADATA_KV_TIMEOUT_MS', 2_500),
    queryTimeoutMs: positiveInt(env, 'CBT_METADATA_QUERY_TIMEOUT_MS', 10_000),
    txTimeoutMs: positiveInt(env, 'CBT_METADATA_TX_TIMEOUT_MS', 15_000),
  };
}
