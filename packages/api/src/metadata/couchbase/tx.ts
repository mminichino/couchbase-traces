import type { Cluster, TransactionAttemptContext } from 'couchbase';

import { collectionOf } from '@/metadata/couchbase/cluster';
import type { MetadataConfig } from '@/metadata/couchbase/config';
import { fromCouchbaseError, TransactionFailedError } from '@/metadata/errors';
import { newId } from '@/metadata/ids';

export type TxContext = TransactionAttemptContext;

/**
 * Multi-document atomic writes (plan D9). The SDK retries transient attempt
 * failures itself; whatever escapes becomes a TransactionFailedError or the
 * mapped cause (DuplicateKeyError for a uniqueness collision inside the tx).
 */
export async function withTransaction<R>(
  cluster: Cluster,
  fn: (ctx: TxContext) => Promise<R>,
  o: { secrets?: string[] } = {},
): Promise<R> {
  let result: { value: R } | undefined;
  try {
    await cluster.transactions().run(async ctx => {
      result = { value: await fn(ctx) };
    });
  } catch (err) {
    const cause = err instanceof Error ? err.cause : undefined;
    const mapped = fromCouchbaseError(cause ?? err, { secrets: o.secrets });
    if (mapped instanceof TransactionFailedError || cause == null) {
      throw fromCouchbaseError(err, { secrets: o.secrets });
    }
    throw mapped;
  }
  if (!result)
    throw new TransactionFailedError('transaction returned no result');
  return result.value;
}

/**
 * Inserts and removes one document in a transaction. Surfaces durability
 * problems (DurabilityImpossible on a single node with replicas) at startup
 * instead of on the first team creation.
 */
export async function probeTransactions(
  cluster: Cluster,
  cfg: Pick<MetadataConfig, 'bucket' | 'scope' | 'password'>,
): Promise<void> {
  const coll = collectionOf(cluster, cfg, 'system');
  const key = `probe::${newId()}`;
  await withTransaction(
    cluster,
    async ctx => {
      const doc = await ctx.insert(coll, key, { probe: true });
      await ctx.remove(doc);
    },
    { secrets: [cfg.password] },
  );
}
