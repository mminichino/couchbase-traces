import type { Cluster } from 'couchbase';

import {
  COLLECTIONS,
  type CollectionSpec,
  createIndexSql,
  keyspace,
} from '@/model/collections';
import { SetupError } from '@/setup/errors';

export type IndexRow = {
  name?: string;
  keyspace_id?: string;
  index_key?: unknown;
  state?: string;
};

/** Whitespace, backticks, and the parentheses Couchbase stores around keys. */
export function normalizeIndexExpr(value: unknown): string {
  const text = Array.isArray(value)
    ? value.map(String).join(',')
    : String(value ?? '');
  return text.replace(/[\s`()]/g, '').toLowerCase();
}

export function indexStatements(
  bucket: string,
  scope: string,
  replicas: number,
): string[] {
  const lines: string[] = [];
  for (const spec of COLLECTIONS) {
    for (const index of spec.indexes) {
      lines.push(createIndexSql(bucket, scope, spec, index, replicas));
    }
  }
  return lines;
}

export async function ensureIndexes(
  cluster: Cluster,
  opts: {
    bucket: string;
    scope: string;
    replicas: number;
    recreateDrifted: boolean;
    waitTimeoutS: number;
    log: (line: string) => void;
  },
): Promise<void> {
  const existing = await listIndexes(cluster, opts.bucket, opts.scope);
  const build: { spec: CollectionSpec; names: string[] }[] = [];
  for (const spec of COLLECTIONS) {
    const names: string[] = [];
    for (const index of spec.indexes) {
      const row = existing.find(
        item => item.name === index.name && item.keyspace_id === spec.name,
      );
      const sql = createIndexSql(
        opts.bucket,
        opts.scope,
        spec,
        index,
        opts.replicas,
      );
      if (!row) {
        await queryRetry(cluster, sql);
        opts.log(`created index ${index.name}`);
        names.push(index.name);
        continue;
      }
      const drifted =
        normalizeIndexExpr(row.index_key) !==
        normalizeIndexExpr(index.keys.join(','));
      if (drifted) {
        opts.log(`DRIFT ${index.name}`);
        opts.log(`drift index ${index.name}`);
        if (opts.recreateDrifted) {
          await cluster.query(
            `DROP INDEX ${index.name} ON ${keyspace(opts.bucket, opts.scope, spec.name)}`,
          );
          await queryRetry(cluster, sql);
          opts.log(`updated index ${index.name}`);
          names.push(index.name);
        }
        continue;
      }
      opts.log(`exists index ${index.name}`);
      if (row.state === 'deferred') names.push(index.name);
    }
    if (names.length > 0) build.push({ spec, names });
  }
  for (const item of build) {
    const list = item.names.join(', ');
    await queryRetry(
      cluster,
      `BUILD INDEX ON ${keyspace(opts.bucket, opts.scope, item.spec.name)}(${list})`,
    );
  }
  await waitOnline(cluster, opts);
}

async function queryRetry(
  cluster: Cluster,
  statement: string,
  parameters?: Record<string, string>,
) {
  let last: unknown;
  for (let attempt = 0; attempt < 45; attempt++) {
    try {
      return await cluster.query(
        statement,
        parameters ? { parameters } : undefined,
      );
    } catch (err) {
      last = err;
      const context = (err as { context?: unknown }).context;
      const message = `${err instanceof Error ? err.message : String(err)} ${
        context ? JSON.stringify(context) : ''
      }`;
      if (
        !/rebalance|fully upgraded|not ready|temporary|service not available/i.test(
          message,
        )
      ) {
        throw err;
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  throw last;
}

async function listIndexes(
  cluster: Cluster,
  bucket: string,
  scope: string,
): Promise<IndexRow[]> {
  const result = await queryRetry(
    cluster,
    'SELECT name, keyspace_id, index_key, state FROM system:indexes WHERE bucket_id = $bucket AND scope_id = $scope',
    { bucket, scope },
  );
  return result.rows as IndexRow[];
}

async function waitOnline(
  cluster: Cluster,
  opts: { bucket: string; scope: string; waitTimeoutS: number },
): Promise<void> {
  const wanted = COLLECTIONS.flatMap(spec =>
    spec.indexes.map(index => index.name),
  );
  const deadline = Date.now() + opts.waitTimeoutS * 1000;
  while (Date.now() < deadline) {
    const rows = await listIndexes(cluster, opts.bucket, opts.scope);
    const pending = wanted.filter(name => {
      const row = rows.find(item => item.name === name);
      return !row || row.state !== 'online';
    });
    if (pending.length === 0) return;
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new SetupError('index build timed out', 4);
}
