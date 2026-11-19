import type { Cluster, TransactionAttemptContext } from 'couchbase';

import { collectionOf } from '@/metadata/couchbase/cluster';
import type { MetadataConfig } from '@/metadata/couchbase/config';
import { buildFind } from '@/metadata/couchbase/find';
import { metaKeyspaceSql } from '@/metadata/couchbase/keyspace';
import {
  fromCouchbaseError,
  NotFoundError,
  TransactionFailedError,
} from '@/metadata/errors';
import { newId } from '@/metadata/ids';
import type {
  FindSpec,
  Found,
  MetaCollection,
  MetaTransactions,
  MetaTx,
} from '@/metadata/types';

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

type TxConfig = Pick<MetadataConfig, 'bucket' | 'scope' | 'password'>;

/**
 * MetaTx over a transaction attempt. Reads go through the attempt's query
 * context (never `cluster.query`), so they see the attempt's own writes;
 * writes are KV mutations on the documents those reads returned.
 */
class CouchbaseTx implements MetaTx {
  constructor(
    private readonly ctx: TxContext,
    private readonly cluster: Cluster,
    private readonly cfg: TxConfig,
  ) {}

  async get<T>(c: MetaCollection, key: string): Promise<T | null> {
    const res = await this.ctx.query<T>(
      `SELECT RAW d FROM ${metaKeyspaceSql(this.cfg, c)} AS d USE KEYS [$key]`,
      { parameters: { key } },
    );
    return res.rows[0] ?? null;
  }

  async find<T>(c: MetaCollection, spec: FindSpec): Promise<Found<T>[]> {
    const q = buildFind(this.cfg, c, spec);
    const res = await this.ctx.query<{ k: string; v: T }>(q.statement, {
      parameters: q.parameters,
    });
    return res.rows.map(r => ({ key: r.k, value: r.v }));
  }

  private async load(c: MetaCollection, key: string) {
    try {
      return await this.ctx.get(collectionOf(this.cluster, this.cfg, c), key);
    } catch (err) {
      const mapped = fromCouchbaseError(err, { secrets: [this.cfg.password] });
      if (mapped instanceof NotFoundError) {
        throw new NotFoundError(`${c}:${key} not found`);
      }
      throw mapped;
    }
  }

  async replace<T>(c: MetaCollection, key: string, value: T): Promise<void> {
    await this.ctx.replace(await this.load(c, key), value);
  }

  async remove(c: MetaCollection, key: string): Promise<void> {
    await this.ctx.remove(await this.load(c, key));
  }
}

export class CouchbaseTransactions implements MetaTransactions {
  constructor(
    private readonly cluster: Cluster,
    private readonly cfg: TxConfig,
  ) {}

  run<R>(fn: (tx: MetaTx) => Promise<R>): Promise<R> {
    return withTransaction(
      this.cluster,
      ctx => fn(new CouchbaseTx(ctx, this.cluster, this.cfg)),
      { secrets: [this.cfg.password] },
    );
  }
}
