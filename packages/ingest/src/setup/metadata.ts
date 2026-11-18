import {
  METADATA_DEFAULTS,
  METADATA_INDEXES,
  metadataIndexStatement,
  metadataProvisionRoles,
  metadataRoles,
} from '@couchbase-traces/common-utils/dist/couchbase/metadataKeyspace';
import { ensureMetadataKeyspace } from '@couchbase-traces/common-utils/dist/couchbase/nodeMetadataProvision';
import type { Cluster } from 'couchbase';

import { SetupError } from '@/setup/errors';

/** App metadata bucket settings read from CBT_METADATA_* (plan D1/D12). */
export type MetadataSetupConfig = {
  bucket: string;
  scope: string;
  ramMb: number;
  replicas: number;
  indexReplicas: number;
  user?: string;
  password?: string;
  /** Grants scope/index management so the API can auto-provision. */
  provisionRoles: boolean;
};

function wholeNumber(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
): number {
  const raw = env[name];
  if (raw == null || raw === '') return fallback;
  if (!/^\d+$/.test(raw))
    throw new SetupError(`${name} must be a whole number`, 1);
  return Number(raw);
}

export function metadataSetupConfig(
  env: NodeJS.ProcessEnv,
  telemetryIndexReplicas: number,
): MetadataSetupConfig {
  return {
    bucket: env.CBT_METADATA_BUCKET || METADATA_DEFAULTS.bucket,
    scope: env.CBT_METADATA_SCOPE || METADATA_DEFAULTS.scope,
    ramMb: wholeNumber(env, 'CBT_METADATA_RAM_MB', METADATA_DEFAULTS.ramMb),
    replicas: wholeNumber(env, 'CBT_METADATA_REPLICAS', 0),
    indexReplicas: wholeNumber(
      env,
      'CBT_METADATA_INDEX_REPLICAS',
      telemetryIndexReplicas,
    ),
    user: env.CBT_METADATA_USER || undefined,
    password: env.CBT_METADATA_PASSWORD || undefined,
    provisionRoles: env.CBT_METADATA_AUTO_PROVISION === 'true',
  };
}

export function metadataDryRun(
  cfg: MetadataSetupConfig,
  createBucket: boolean,
  log: (line: string) => void,
): void {
  log(`${createBucket ? 'created' : 'skipped'} bucket ${cfg.bucket}`);
  for (const spec of METADATA_INDEXES) {
    log(metadataIndexStatement(cfg.bucket, cfg.scope, spec, cfg.indexReplicas));
  }
}

export function metadataCapellaAccess(cfg: MetadataSetupConfig): string[] {
  const roles = [
    ...metadataRoles(cfg.bucket),
    ...(cfg.provisionRoles ? metadataProvisionRoles(cfg.bucket) : []),
  ];
  return [
    `Create bucket ${cfg.bucket} (Magma, ${cfg.ramMb} MiB or more) before running setup.`,
    `CBT_METADATA_USER: ${roles.join(', ')}`,
  ];
}

export async function runMetadataSetup(
  cluster: Cluster,
  opts: {
    cfg: MetadataSetupConfig;
    createBucket: boolean;
    createUsers: boolean;
    capella: boolean;
    waitTimeoutS: number;
    appVersion?: string;
    log: (line: string) => void;
  },
): Promise<void> {
  const { cfg, log } = opts;
  let user:
    | { username: string; password: string; provisionRoles: boolean }
    | undefined;
  if (opts.createUsers && !opts.capella) {
    if (!cfg.user || !cfg.password) {
      // Optional until C1 switches the first entity: the API runs with the
      // metadata store disabled when it has no credentials.
      log(
        'skipped metadata user (set CBT_METADATA_USER and CBT_METADATA_PASSWORD)',
      );
    } else {
      user = {
        username: cfg.user,
        password: cfg.password,
        provisionRoles: cfg.provisionRoles,
      };
    }
  }
  if (opts.capella) {
    for (const line of metadataCapellaAccess(cfg)) log(line);
  }
  try {
    await ensureMetadataKeyspace(cluster, {
      bucket: cfg.bucket,
      scope: cfg.scope,
      ramMb: cfg.ramMb,
      replicas: cfg.replicas,
      indexReplicas: cfg.indexReplicas,
      createBucket: opts.createBucket && !opts.capella,
      user,
      appVersion: opts.appVersion,
      waitTimeoutS: opts.waitTimeoutS,
      log,
    });
  } catch (err) {
    const code = (err as { exitCode?: unknown }).exitCode;
    if (typeof code === 'number' && err instanceof Error) {
      throw new SetupError(err.message, code);
    }
    throw err;
  }
}
