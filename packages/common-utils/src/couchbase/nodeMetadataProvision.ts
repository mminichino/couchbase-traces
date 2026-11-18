// Server only: imports the Couchbase SDK. Idempotent provisioning of the app
// metadata bucket (MongoDB elimination plan D1/D7/D8, §2.6). Shared by the
// ingest setup command (admin credentials) and API auto-provisioning.
import type { Cluster } from 'couchbase';

import {
  isSchemaNewer,
  METADATA_COLLECTIONS,
  METADATA_SCHEMA_KEY,
  METADATA_SCHEMA_VERSION,
  metadataProvisionRoles,
  metadataRoles,
  type MetadataSchemaDoc,
} from './metadataKeyspace';
import {
  ensureMetadataIndexes,
  MetadataProvisionError,
  type MetaLog,
} from './nodeMetadataIndexes';

export type MetadataProvisionOptions = {
  bucket: string;
  scope: string;
  ramMb: number;
  replicas: number;
  indexReplicas: number;
  /** False on Capella or when the API provisions: the bucket must exist. */
  createBucket: boolean;
  /** Set to create or update the metadata RBAC user (self-managed only). */
  user?: { username: string; password: string; provisionRoles: boolean };
  appVersion?: string;
  waitTimeoutS: number;
  log: MetaLog;
  now?: () => Date;
};

export type MetadataProvisionResult = {
  created: string[];
  schemaVersion: number;
};

function isNotFound(err: unknown): boolean {
  const name = err instanceof Error ? err.name : '';
  return /NotFound/.test(name);
}

function isExists(err: unknown): boolean {
  const name = err instanceof Error ? err.name : '';
  return /Exists/.test(name);
}

async function ensureBucket(
  cluster: Cluster,
  o: MetadataProvisionOptions,
  created: string[],
): Promise<void> {
  const buckets = await cluster.buckets().getAllBuckets();
  if (buckets.some(b => b.name === o.bucket)) {
    o.log(`exists bucket ${o.bucket}`);
    return;
  }
  if (!o.createBucket) {
    throw new MetadataProvisionError(`Bucket ${o.bucket} missing`, 2);
  }
  await cluster.buckets().createBucket({
    name: o.bucket,
    ramQuotaMB: o.ramMb,
    bucketType: 'membase',
    storageBackend: 'magma',
    numReplicas: o.replicas,
    evictionPolicy: 'fullEviction',
  });
  created.push(`bucket ${o.bucket}`);
  o.log(`created bucket ${o.bucket}`);
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      await cluster.bucket(o.bucket).collections().getAllScopes();
      return;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  throw new MetadataProvisionError(`Bucket ${o.bucket} was not ready`, 5);
}

async function ensureScopeAndCollections(
  cluster: Cluster,
  o: MetadataProvisionOptions,
  created: string[],
): Promise<void> {
  const manager = cluster.bucket(o.bucket).collections();
  const scopes = await manager.getAllScopes();
  const scope = scopes.find(s => s.name === o.scope);
  if (!scope) {
    try {
      await manager.createScope(o.scope);
      created.push(`scope ${o.scope}`);
      o.log(`created scope ${o.scope}`);
    } catch (err) {
      if (!isExists(err)) throw err;
    }
  } else {
    o.log(`exists scope ${o.scope}`);
  }
  const current = scope?.collections ?? [];
  for (const spec of METADATA_COLLECTIONS) {
    const found = current.find(c => c.name === spec.name);
    if (!found) {
      try {
        await manager.createCollection(spec.name, o.scope, {
          maxExpiry: spec.maxTTL,
        });
        created.push(`collection ${spec.name}`);
        o.log(`created collection ${spec.name}`);
      } catch (err) {
        if (!isExists(err)) throw err;
        o.log(`exists collection ${spec.name}`);
      }
      continue;
    }
    if ((found.maxExpiry ?? 0) !== spec.maxTTL) {
      await manager.updateCollection(spec.name, o.scope, {
        maxExpiry: spec.maxTTL,
      });
      o.log(`updated collection ${spec.name}`);
      continue;
    }
    o.log(`exists collection ${spec.name}`);
  }
}

async function ensureUser(
  cluster: Cluster,
  o: MetadataProvisionOptions,
): Promise<void> {
  if (!o.user) return;
  const roles = [
    ...metadataRoles(o.bucket),
    ...(o.user.provisionRoles ? metadataProvisionRoles(o.bucket) : []),
  ];
  let existed = true;
  try {
    await cluster.users().getUser(o.user.username);
  } catch (err) {
    if (!isNotFound(err)) throw err;
    existed = false;
  }
  await cluster.users().upsertUser({
    username: o.user.username,
    password: o.user.password,
    roles,
  });
  o.log(`${existed ? 'exists' : 'created'} user ${o.user.username}`);
}

type StoredMarker = Pick<MetadataSchemaDoc, 'schemaVersion'> & {
  provisionedAt?: string;
};

/** Narrows the stored marker; a malformed one counts as absent. */
function toSchemaDoc(v: unknown): StoredMarker | null {
  if (typeof v !== 'object' || v === null || !('schemaVersion' in v)) {
    return null;
  }
  const { schemaVersion } = v;
  if (typeof schemaVersion !== 'number') return null;
  const provisionedAt =
    'provisionedAt' in v && typeof v.provisionedAt === 'string'
      ? v.provisionedAt
      : undefined;
  return { schemaVersion, provisionedAt };
}

/**
 * Writes or raises `meta::schema`. Refuses to lower it: a stored version from
 * a newer release means this code must not touch the bucket (D8).
 */
export async function ensureSchemaMarker(
  cluster: Cluster,
  o: Pick<
    MetadataProvisionOptions,
    'bucket' | 'scope' | 'appVersion' | 'log' | 'now'
  >,
): Promise<number> {
  const coll = cluster.bucket(o.bucket).scope(o.scope).collection('system');
  const now = (o.now ?? (() => new Date()))().toISOString();
  let stored: StoredMarker | null = null;
  try {
    const content: unknown = (await coll.get(METADATA_SCHEMA_KEY)).content;
    stored = toSchemaDoc(content);
  } catch (err) {
    if (!isNotFound(err)) throw err;
  }
  if (isSchemaNewer(stored?.schemaVersion)) {
    throw new MetadataProvisionError(
      `Metadata schema version ${stored?.schemaVersion} is newer than this release (${METADATA_SCHEMA_VERSION})`,
      6,
    );
  }
  if (stored?.schemaVersion === METADATA_SCHEMA_VERSION) {
    o.log(`exists schema version ${METADATA_SCHEMA_VERSION}`);
    return METADATA_SCHEMA_VERSION;
  }
  const doc: MetadataSchemaDoc = {
    schemaVersion: METADATA_SCHEMA_VERSION,
    appVersion: o.appVersion,
    provisionedAt: stored?.provisionedAt ?? now,
    updatedAt: now,
  };
  await coll.upsert(METADATA_SCHEMA_KEY, doc);
  o.log(
    `${stored ? 'updated' : 'created'} schema version ${METADATA_SCHEMA_VERSION}`,
  );
  return METADATA_SCHEMA_VERSION;
}

/** Every step tolerates "already exists"; nothing is ever dropped. */
export async function ensureMetadataKeyspace(
  cluster: Cluster,
  o: MetadataProvisionOptions,
): Promise<MetadataProvisionResult> {
  const created: string[] = [];
  await ensureBucket(cluster, o, created);
  await ensureScopeAndCollections(cluster, o, created);
  const indexes = await ensureMetadataIndexes(cluster, {
    bucket: o.bucket,
    scope: o.scope,
    replicas: o.indexReplicas,
    waitTimeoutS: o.waitTimeoutS,
    log: o.log,
  });
  created.push(...indexes.map(name => `index ${name}`));
  await ensureUser(cluster, o);
  const schemaVersion = await ensureSchemaMarker(cluster, o);
  return { created, schemaVersion };
}
