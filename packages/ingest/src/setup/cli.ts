import { dnsConfig } from '@couchbase-traces/common-utils/dist/couchbase/dnsConfig';
import { connect, type ConnectOptions } from 'couchbase';

import { isCapella, ttlByCollection, wanProfile } from '@/config';
import { COLLECTIONS, searchDefinitionWithReplicas } from '@/model/collections';
import { connectWithAuthRetry } from '@/setup/connect';
import { writeDocs } from '@/setup/docs';
import { exitCodeOf, SetupError } from '@/setup/errors';
import { ensureIndexes, indexStatements } from '@/setup/indexes';
import { ensureBucket, ensureCollections } from '@/setup/keyspace';
import {
  metadataDryRun,
  metadataSetupConfig,
  runMetadataSetup,
} from '@/setup/metadata';
import { ensureSearchIndexes } from '@/setup/search';
import { ensureUsers } from '@/setup/users';

// How long to keep retrying authentication failures on the first connect
// (D30). Long enough for a just-initialized node; short enough that a wrong
// password fails well before compose or the all-in-one gives up.
const AUTH_RETRY_DEADLINE_MS = 60_000;

export type SetupOptions = {
  createBucket: boolean;
  bucketRamMb: number;
  indexReplicas: number;
  createUsers: boolean;
  skipSearch: boolean;
  recreateDrifted: boolean;
  waitTimeoutS: number;
  dryRun: boolean;
  docs: boolean;
  /** App metadata bucket (metadata plan D7); on unless --no-metadata. */
  metadata: boolean;
};

export function parseArgs(argv: string[]): SetupOptions {
  const opts: SetupOptions = {
    createBucket: false,
    bucketRamMb: 1024,
    indexReplicas: -1,
    createUsers: false,
    skipSearch: false,
    recreateDrifted: false,
    waitTimeoutS: 900,
    dryRun: false,
    docs: false,
    metadata: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--create-bucket') opts.createBucket = true;
    else if (arg === '--create-users') opts.createUsers = true;
    else if (arg === '--skip-search') opts.skipSearch = true;
    else if (arg === '--recreate-drifted') opts.recreateDrifted = true;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--docs') opts.docs = true;
    else if (arg === '--no-metadata') opts.metadata = false;
    else if (arg === '--bucket-ram-mb')
      opts.bucketRamMb = numberArg(argv, ++i, arg);
    else if (arg === '--index-replicas')
      opts.indexReplicas = numberArg(argv, ++i, arg);
    else if (arg === '--wait-timeout-s')
      opts.waitTimeoutS = numberArg(argv, ++i, arg);
    else throw new SetupError(`Unknown argument ${arg}`, 1);
  }
  return opts;
}

function numberArg(argv: string[], index: number, flag: string): number {
  const raw = argv[index];
  if (raw == null || !/^\d+$/.test(raw)) {
    throw new SetupError(`${flag} requires a whole number`, 1);
  }
  return Number(raw);
}

export async function runSetup(
  argv: string[],
  env: NodeJS.ProcessEnv,
  log: (line: string) => void = line => console.log(line),
): Promise<number> {
  try {
    const opts = parseArgs(argv);
    if (opts.docs) {
      writeDocs();
      log('updated docs');
      return 0;
    }
    const connstr = required(env, 'CBT_COUCHBASE_CONNSTR');
    const bucket = env.CBT_COUCHBASE_BUCKET || 'otel';
    const scope = env.CBT_COUCHBASE_SCOPE || 'default';
    const replicas =
      opts.indexReplicas >= 0
        ? opts.indexReplicas
        : envInt(env.CBT_COUCHBASE_INDEX_REPLICAS, 0);
    const ttl = ttlByCollection(env);
    if (opts.dryRun) {
      log(`${opts.createBucket ? 'created' : 'skipped'} bucket ${bucket}`);
      for (const spec of COLLECTIONS) log(`created collection ${spec.name}`);
      for (const statement of indexStatements(bucket, scope, replicas))
        log(statement);
      if (!opts.skipSearch) {
        for (const spec of COLLECTIONS) {
          if (!spec.search) continue;
          log(`created search ${spec.search.name}`);
          log(
            JSON.stringify(searchDefinitionWithReplicas(spec.search, replicas)),
          );
        }
      } else {
        log('skipped search');
      }
      log(opts.createUsers ? 'created users' : 'skipped users');
      if (opts.metadata) {
        metadataDryRun(
          metadataSetupConfig(env, replicas),
          opts.createBucket,
          log,
        );
      } else {
        log('skipped metadata');
      }
      return 0;
    }
    required(env, 'CBT_COUCHBASE_ADMIN_USER');
    required(env, 'CBT_COUCHBASE_ADMIN_PASSWORD');
    const cluster = await connectAdmin(env, connstr, log);
    try {
      await ensureBucket(cluster, {
        name: bucket,
        create: opts.createBucket,
        capella: isCapella(connstr),
        ramMb: opts.bucketRamMb,
        log,
      });
      await ensureCollections(cluster, { bucket, scope, ttlMs: ttl, log });
      await ensureIndexes(cluster, {
        bucket,
        scope,
        replicas,
        recreateDrifted: opts.recreateDrifted,
        waitTimeoutS: opts.waitTimeoutS,
        log,
      });
      if (opts.skipSearch) log('skipped search');
      else await ensureSearchIndexes(cluster, { bucket, scope, replicas, log });
      if (opts.createUsers) {
        await ensureUsers(cluster, {
          env,
          bucket,
          scope,
          capella: isCapella(connstr),
          log,
        });
      } else {
        log('skipped users');
      }
      if (opts.metadata) {
        await provisionMetadata(env, connstr, cluster, opts, replicas, log);
      } else {
        log('skipped metadata');
      }
    } finally {
      await cluster.close().catch(() => undefined);
    }
    return 0;
  } catch (err) {
    log(describeError(err));
    return exitCodeOf(err);
  }
}

async function provisionMetadata(
  env: NodeJS.ProcessEnv,
  connstr: string,
  telemetryCluster: Awaited<ReturnType<typeof connectAdmin>>,
  opts: SetupOptions,
  replicas: number,
  log: (line: string) => void,
): Promise<void> {
  // Same cluster by default; CBT_METADATA_CONNSTR may point elsewhere.
  const metaConnstr = env.CBT_METADATA_CONNSTR || connstr;
  const cluster =
    metaConnstr === connstr
      ? telemetryCluster
      : await connectAdmin(env, metaConnstr, log);
  try {
    await runMetadataSetup(cluster, {
      cfg: metadataSetupConfig(env, replicas),
      createBucket: opts.createBucket,
      createUsers: opts.createUsers,
      capella: isCapella(metaConnstr),
      waitTimeoutS: opts.waitTimeoutS,
      appVersion: env.CODE_VERSION,
      log,
    });
  } finally {
    if (cluster !== telemetryCluster) {
      await cluster.close().catch(() => undefined);
    }
  }
}

function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const context = (err as { context?: unknown }).context;
  return context ? `${err.message} ${JSON.stringify(context)}` : err.message;
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (value == null || value === '')
    throw new SetupError(`${name} is required`, 1);
  return value;
}

if (process.argv[1] && /(?:^|\/)cli\.(ts|js)$/.test(process.argv[1])) {
  runSetup(process.argv.slice(2), process.env)
    .then(code => process.exit(code))
    .catch(err => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}

function envInt(raw: string | undefined, fallback: number): number {
  if (raw == null || raw === '') return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new SetupError(
      'CBT_COUCHBASE_INDEX_REPLICAS must be a whole number',
      1,
    );
  }
  return Number(raw);
}

async function connectAdmin(
  env: NodeJS.ProcessEnv,
  connstr: string,
  log: (line: string) => void,
) {
  const options: ConnectOptions = {
    username: env.CBT_COUCHBASE_ADMIN_USER,
    password: env.CBT_COUCHBASE_ADMIN_PASSWORD,
    timeouts: { connectTimeout: 10_000 },
    dnsConfig: dnsConfig(env),
  };
  if (wanProfile(connstr, env.CBT_COUCHBASE_WAN_PROFILE)) {
    options.configProfile = 'wanDevelopment';
  }
  if (env.CBT_COUCHBASE_CA_CERT_PATH) {
    options.security = { trustStorePath: env.CBT_COUCHBASE_CA_CERT_PATH };
  }
  return connectWithAuthRetry(() => connect(connstr, options), {
    deadlineMs: AUTH_RETRY_DEADLINE_MS,
    log,
  });
}
