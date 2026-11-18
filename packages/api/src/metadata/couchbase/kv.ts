import type { Cas as SdkCas, CasInput, Cluster, Collection } from 'couchbase';

import { collectionOf } from '@/metadata/couchbase/cluster';
import type { MetadataConfig } from '@/metadata/couchbase/config';
import { fromCouchbaseError, NotFoundError } from '@/metadata/errors';
import type {
  Cas,
  ExpiryOptions,
  MetaCollection,
  MetaKv,
  Versioned,
} from '@/metadata/types';

const GET_MANY_CONCURRENCY = 32;

/** Our Cas is opaque; only tokens the SDK handed out are ever passed back. */
function isSdkCas(cas: Cas): cas is Cas & SdkCas {
  return 'toJSON' in cas && typeof cas.toJSON === 'function';
}

function casInput(cas: Cas | undefined): CasInput | undefined {
  if (cas === undefined) return undefined;
  if (!isSdkCas(cas)) throw new TypeError('not a Couchbase CAS token');
  return cas;
}

/** MetaKv over the Couchbase SDK. Every SDK error goes through fromCouchbaseError. */
export class CouchbaseKv implements MetaKv {
  constructor(
    private readonly cluster: Cluster,
    private readonly cfg: Pick<MetadataConfig, 'bucket' | 'scope' | 'password'>,
  ) {}

  private coll(c: MetaCollection): Collection {
    return collectionOf(this.cluster, this.cfg, c);
  }

  private fail(err: unknown, kind?: string): never {
    throw fromCouchbaseError(err, { kind, secrets: [this.cfg.password] });
  }

  async get<T>(c: MetaCollection, key: string): Promise<Versioned<T> | null> {
    try {
      const res = await this.coll(c).get(key, { withExpiry: true });
      const expiry = res.expiryTime
        ? new Date(res.expiryTime * 1000)
        : undefined;
      // The collection's repository owns T and validates it (C1+).
      return { value: res.content as T, cas: res.cas, expiry };
    } catch (err) {
      const mapped = fromCouchbaseError(err, { secrets: [this.cfg.password] });
      if (mapped instanceof NotFoundError) return null;
      throw mapped;
    }
  }

  async getMany<T>(c: MetaCollection, keys: string[]): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    const unique = [...new Set(keys)];
    for (let i = 0; i < unique.length; i += GET_MANY_CONCURRENCY) {
      const chunk = unique.slice(i, i + GET_MANY_CONCURRENCY);
      const docs = await Promise.all(
        chunk.map(async k => ({ k, doc: await this.get<T>(c, k) })),
      );
      for (const { k, doc } of docs) if (doc) out.set(k, doc.value);
    }
    return out;
  }

  async insert<T>(
    c: MetaCollection,
    key: string,
    value: T,
    o: { expiry?: Date } = {},
  ): Promise<Cas> {
    try {
      const res = await this.coll(c).insert(key, value, { expiry: o.expiry });
      return res.cas;
    } catch (err) {
      return this.fail(err, `${c}:${key}`);
    }
  }

  async replace<T>(
    c: MetaCollection,
    key: string,
    value: T,
    o: ExpiryOptions & { cas?: Cas } = {},
  ): Promise<Cas> {
    try {
      const res = await this.coll(c).replace(key, value, {
        cas: casInput(o.cas),
        expiry: o.expiry,
        preserveExpiry: o.preserveExpiry,
      });
      return res.cas;
    } catch (err) {
      return this.fail(err);
    }
  }

  async upsert<T>(
    c: MetaCollection,
    key: string,
    value: T,
    o: ExpiryOptions = {},
  ): Promise<Cas> {
    try {
      const res = await this.coll(c).upsert(key, value, {
        expiry: o.expiry,
        preserveExpiry: o.preserveExpiry,
      });
      return res.cas;
    } catch (err) {
      return this.fail(err);
    }
  }

  async remove(
    c: MetaCollection,
    key: string,
    o: { cas?: Cas } = {},
  ): Promise<boolean> {
    try {
      await this.coll(c).remove(key, { cas: casInput(o.cas) });
      return true;
    } catch (err) {
      const mapped = fromCouchbaseError(err, { secrets: [this.cfg.password] });
      if (mapped instanceof NotFoundError) return false;
      throw mapped;
    }
  }

  async touch(c: MetaCollection, key: string, expiry: Date): Promise<boolean> {
    try {
      await this.coll(c).touch(key, expiry);
      return true;
    } catch (err) {
      const mapped = fromCouchbaseError(err, { secrets: [this.cfg.password] });
      if (mapped instanceof NotFoundError) return false;
      throw mapped;
    }
  }
}
