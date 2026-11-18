// Server only: imports the Couchbase SDK. Index DDL, build, and status checks
// for the app metadata bucket (MongoDB elimination plan §2.6).
import type { Cluster } from 'couchbase';

import {
  type MetaCollection,
  METADATA_COLLECTION_NAMES,
  METADATA_INDEXES,
  metadataBuildStatement,
  metadataIndexStatement,
} from './metadataKeyspace';

export class MetadataProvisionError extends Error {
  constructor(
    message: string,
    /** Exit code for the setup CLI (packages/ingest/src/setup/errors.ts). */
    readonly exitCode: number,
  ) {
    super(message);
    this.name = 'MetadataProvisionError';
  }
}

export type MetaLog = (line: string) => void;

type IndexRow = { name?: string; keyspace_id?: string; state?: string };

const RETRYABLE =
  /rebalance|fully upgraded|not ready|temporary|service not available|build already in progress/i;

const BUILD_QUEUED =
  /retried building in the background|indexing\.transient_error/i;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function toIndexRow(v: unknown): IndexRow {
  if (!isRecord(v)) return {};
  const str = (x: unknown) => (typeof x === 'string' ? x : undefined);
  return {
    name: str(v.name),
    keyspace_id: str(v.keyspace_id),
    state: str(v.state),
  };
}

function errorText(err: unknown): string {
  const context = isRecord(err) ? err.context : undefined;
  const message = err instanceof Error ? err.message : String(err);
  return context ? `${message} ${JSON.stringify(context)}` : message;
}

export async function queryWithRetry(
  cluster: Cluster,
  statement: string,
  parameters?: Record<string, unknown>,
  attempts = 45,
  delayMs = 2000,
) {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await cluster.query(
        statement,
        parameters ? { parameters } : undefined,
      );
    } catch (err) {
      last = err;
      if (!RETRYABLE.test(errorText(err))) throw err;
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  throw last;
}

export async function listMetadataIndexes(
  cluster: Cluster,
  bucket: string,
  scope: string,
): Promise<IndexRow[]> {
  const result = await queryWithRetry(
    cluster,
    'SELECT name, keyspace_id, state FROM system:indexes' +
      ' WHERE bucket_id = $bucket AND scope_id = $scope',
    { bucket, scope },
  );
  return (result.rows as unknown[]).map(toIndexRow);
}

export async function ensureMetadataIndexes(
  cluster: Cluster,
  opts: {
    bucket: string;
    scope: string;
    replicas: number;
    waitTimeoutS: number;
    log: MetaLog;
  },
): Promise<string[]> {
  const existing = await listMetadataIndexes(cluster, opts.bucket, opts.scope);
  const created: string[] = [];
  const toBuild = new Map<MetaCollection, string[]>();
  for (const spec of METADATA_INDEXES) {
    const row = existing.find(
      r => r.name === spec.name && r.keyspace_id === spec.collection,
    );
    if (!row) {
      await queryWithRetry(
        cluster,
        metadataIndexStatement(opts.bucket, opts.scope, spec, opts.replicas),
      );
      opts.log(`created index ${spec.name}`);
      created.push(spec.name);
    } else {
      opts.log(`exists index ${spec.name}`);
      if (row.state !== 'deferred') continue;
    }
    toBuild.set(spec.collection, [
      ...(toBuild.get(spec.collection) ?? []),
      spec.name,
    ]);
  }
  for (const [collection, names] of toBuild) {
    try {
      await queryWithRetry(
        cluster,
        metadataBuildStatement(opts.bucket, opts.scope, collection, names),
      );
    } catch (err) {
      // GSI 4360: the build was accepted and is retried in the background;
      // waitForMetadataIndexes below decides whether it finished.
      if (!BUILD_QUEUED.test(errorText(err))) throw err;
      opts.log(`index build on ${collection} queued in the background`);
    }
  }
  await waitForMetadataIndexes(cluster, opts);
  return created;
}

export async function waitForMetadataIndexes(
  cluster: Cluster,
  opts: { bucket: string; scope: string; waitTimeoutS: number },
): Promise<void> {
  const deadline = Date.now() + opts.waitTimeoutS * 1000;
  for (;;) {
    const rows = await listMetadataIndexes(cluster, opts.bucket, opts.scope);
    if (pendingIndexes(rows).length === 0) return;
    if (Date.now() >= deadline) {
      throw new MetadataProvisionError('metadata index build timed out', 4);
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

function pendingIndexes(rows: IndexRow[]): string[] {
  return METADATA_INDEXES.filter(spec => {
    const row = rows.find(
      r => r.name === spec.name && r.keyspace_id === spec.collection,
    );
    return !row || row.state !== 'online';
  }).map(spec => spec.name);
}

export type MetadataVerifyResult = {
  ok: boolean;
  /** Scope, collections, or indexes that do not exist. */
  missing: string[];
  /** Indexes that exist but are not online yet. */
  building: string[];
};

/**
 * Read-only check (plan §2.6, API startup). Reads the system catalog through
 * SQL++ rather than the collections REST API: the least-privilege metadata
 * user has query_system_catalog but not cluster.collection!read.
 */
export async function verifyMetadataKeyspace(
  cluster: Cluster,
  opts: { bucket: string; scope: string },
): Promise<MetadataVerifyResult> {
  const scopes = await queryWithRetry(
    cluster,
    'SELECT RAW name FROM system:scopes WHERE `bucket` = $bucket AND name = $scope',
    { bucket: opts.bucket, scope: opts.scope },
  );
  if (scopes.rows.length === 0) {
    return { ok: false, missing: [`scope ${opts.scope}`], building: [] };
  }
  const collections = await queryWithRetry(
    cluster,
    'SELECT RAW name FROM system:keyspaces' +
      ' WHERE `bucket` = $bucket AND `scope` = $scope',
    { bucket: opts.bucket, scope: opts.scope },
  );
  const present = new Set(
    (collections.rows as unknown[]).filter(r => typeof r === 'string'),
  );
  const missing = METADATA_COLLECTION_NAMES.filter(
    name => !present.has(name),
  ).map(name => `collection ${name}`);
  const rows = await listMetadataIndexes(cluster, opts.bucket, opts.scope);
  const building: string[] = [];
  for (const name of pendingIndexes(rows)) {
    if (rows.some(r => r.name === name)) building.push(name);
    else missing.push(`index ${name}`);
  }
  return {
    ok: missing.length === 0 && building.length === 0,
    missing,
    building,
  };
}
