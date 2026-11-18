import {
  CasConflictError,
  DuplicateKeyError,
  NotFoundError,
} from '@/metadata/errors';
import type {
  Cas,
  ExpiryOptions,
  MetaCollection,
  MetaKv,
  Versioned,
} from '@/metadata/types';

type Entry = { value: unknown; cas: Cas; expiry?: Date };

/**
 * MetaKv in process memory with the Couchbase semantics the contract suite
 * pins down: insert collides, CAS mismatches throw, every mutation clears
 * the expiry unless `preserveExpiry`, and values are deep-copied so callers
 * cannot mutate stored state (the SDK serializes to JSON too).
 */
export class MemoryKv implements MetaKv {
  private readonly data = new Map<string, Entry>();

  constructor(private readonly now: () => Date = () => new Date()) {}

  private k(c: MetaCollection, key: string): string {
    return `${c}\u0000${key}`;
  }

  private live(c: MetaCollection, key: string): Entry | undefined {
    const id = this.k(c, key);
    const entry = this.data.get(id);
    if (entry?.expiry && entry.expiry <= this.now()) {
      this.data.delete(id);
      return undefined;
    }
    return entry;
  }

  private write(
    c: MetaCollection,
    key: string,
    value: unknown,
    expiry?: Date,
  ): Cas {
    const cas: Cas = {};
    this.data.set(this.k(c, key), {
      value: JSON.parse(JSON.stringify(value)),
      cas,
      expiry,
    });
    return cas;
  }

  async get<T>(c: MetaCollection, key: string): Promise<Versioned<T> | null> {
    const entry = this.live(c, key);
    if (!entry) return null;
    return {
      // Same contract as CouchbaseKv.get: the repository owns T.
      value: structuredClone(entry.value) as T,
      cas: entry.cas,
      expiry: entry.expiry,
    };
  }

  async getMany<T>(c: MetaCollection, keys: string[]): Promise<Map<string, T>> {
    const out = new Map<string, T>();
    for (const key of keys) {
      const doc = await this.get<T>(c, key);
      if (doc) out.set(key, doc.value);
    }
    return out;
  }

  async insert<T>(
    c: MetaCollection,
    key: string,
    value: T,
    o: { expiry?: Date } = {},
  ): Promise<Cas> {
    if (this.live(c, key)) throw new DuplicateKeyError(`${c}:${key}`);
    return this.write(c, key, value, o.expiry);
  }

  async replace<T>(
    c: MetaCollection,
    key: string,
    value: T,
    o: ExpiryOptions & { cas?: Cas } = {},
  ): Promise<Cas> {
    const entry = this.live(c, key);
    if (!entry) throw new NotFoundError(`${c}:${key} not found`);
    if (o.cas && o.cas !== entry.cas) {
      throw new CasConflictError(`${c}:${key} changed`);
    }
    return this.write(
      c,
      key,
      value,
      o.preserveExpiry ? entry.expiry : o.expiry,
    );
  }

  async upsert<T>(
    c: MetaCollection,
    key: string,
    value: T,
    o: ExpiryOptions = {},
  ): Promise<Cas> {
    const entry = this.live(c, key);
    return this.write(
      c,
      key,
      value,
      o.preserveExpiry && entry ? entry.expiry : o.expiry,
    );
  }

  async remove(
    c: MetaCollection,
    key: string,
    o: { cas?: Cas } = {},
  ): Promise<boolean> {
    const entry = this.live(c, key);
    if (!entry) return false;
    if (o.cas && o.cas !== entry.cas) {
      throw new CasConflictError(`${c}:${key} changed`);
    }
    this.data.delete(this.k(c, key));
    return true;
  }

  async touch(c: MetaCollection, key: string, expiry: Date): Promise<boolean> {
    const entry = this.live(c, key);
    if (!entry) return false;
    entry.expiry = expiry;
    return true;
  }

  /** Test helper: every live key in a collection. */
  keys(c: MetaCollection): string[] {
    const prefix = `${c}\u0000`;
    return [...this.data.keys()]
      .filter(id => id.startsWith(prefix))
      .map(id => id.slice(prefix.length))
      .filter(key => this.live(c, key));
  }

  /** Live documents in a collection, as copies (MemoryFind scans these). */
  entries<T>(c: MetaCollection): { key: string; value: T }[] {
    return this.keys(c).flatMap(key => {
      const entry = this.live(c, key);
      return entry ? [{ key, value: structuredClone(entry.value) as T }] : [];
    });
  }

  clear(): void {
    this.data.clear();
  }
}
