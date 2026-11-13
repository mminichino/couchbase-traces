import type { Cluster } from 'couchbase';

import { COLLECTIONS } from '@/model/collections';
import { SetupError } from '@/setup/errors';
import { ttlSeconds } from '@/ttl';

export async function ensureBucket(
  cluster: Cluster,
  opts: {
    name: string;
    create: boolean;
    capella: boolean;
    ramMb: number;
    log: (line: string) => void;
  },
): Promise<void> {
  const buckets = await cluster.buckets().getAllBuckets();
  const exists = buckets.some(bucket => bucket.name === opts.name);
  if (exists) {
    opts.log(`exists bucket ${opts.name}`);
    return;
  }
  if (!opts.create || opts.capella) {
    throw new SetupError(`Bucket ${opts.name} missing`, 2);
  }
  await cluster.buckets().createBucket({
    name: opts.name,
    ramQuotaMB: opts.ramMb,
    bucketType: 'membase',
    storageBackend: 'magma',
    numReplicas: 0,
  });
  opts.log(`created bucket ${opts.name}`);
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try {
      await cluster.bucket(opts.name).collections().getAllScopes();
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new SetupError(`Bucket ${opts.name} was not ready`, 5);
}

export async function ensureCollections(
  cluster: Cluster,
  opts: {
    bucket: string;
    scope: string;
    ttlMs: Record<string, number>;
    log: (line: string) => void;
  },
): Promise<void> {
  const manager = cluster.bucket(opts.bucket).collections();
  const scopes = await manager.getAllScopes();
  const scope = scopes.find(item => item.name === opts.scope);
  if (!scope) {
    await manager.createScope(opts.scope);
    opts.log(`created scope ${opts.scope}`);
  } else {
    opts.log(`exists scope ${opts.scope}`);
  }
  const fresh = scope ? scope.collections : [];
  for (const spec of COLLECTIONS) {
    const seconds = ttlSeconds(opts.ttlMs[spec.name] ?? 0);
    const current = fresh.find(item => item.name === spec.name);
    if (!current) {
      await manager.createCollection(spec.name, opts.scope, {
        maxExpiry: seconds,
      });
      opts.log(`created collection ${spec.name}`);
      continue;
    }
    if (current.maxExpiry !== seconds) {
      await manager.updateCollection(spec.name, opts.scope, {
        maxExpiry: seconds,
      });
      opts.log(`updated collection ${spec.name}`);
      continue;
    }
    opts.log(`exists collection ${spec.name}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
