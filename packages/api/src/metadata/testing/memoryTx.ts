import { NotFoundError } from '@/metadata/errors';
import type { MemoryFind } from '@/metadata/testing/memoryFind';
import type { MemoryKv } from '@/metadata/testing/memoryKv';
import type {
  FindSpec,
  Found,
  MetaCollection,
  MetaTransactions,
  MetaTx,
} from '@/metadata/types';

class MemoryTx implements MetaTx {
  constructor(
    private readonly kv: MemoryKv,
    private readonly finder: MemoryFind,
  ) {}

  async get<T>(c: MetaCollection, key: string): Promise<T | null> {
    return (await this.kv.get<T>(c, key))?.value ?? null;
  }

  find<T>(c: MetaCollection, spec: FindSpec): Promise<Found<T>[]> {
    return this.finder.find<T>(c, spec);
  }

  async replace<T>(c: MetaCollection, key: string, value: T): Promise<void> {
    await this.kv.replace(c, key, value, { preserveExpiry: true });
  }

  async remove(c: MetaCollection, key: string): Promise<void> {
    if (!(await this.kv.remove(c, key))) {
      throw new NotFoundError(`${c}:${key} not found`);
    }
  }
}

/**
 * Transactions as one serialized critical section with rollback on throw,
 * which is what the contract suite needs: all-or-nothing and no interleaving.
 */
export class MemoryTransactions implements MetaTransactions {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly kv: MemoryKv,
    private readonly finder: MemoryFind,
  ) {}

  run<R>(fn: (tx: MetaTx) => Promise<R>): Promise<R> {
    const attempt = async () => {
      const before = this.kv.snapshot();
      try {
        return await fn(new MemoryTx(this.kv, this.finder));
      } catch (err) {
        this.kv.restore(before);
        throw err;
      }
    };
    const result = this.tail.then(attempt, attempt);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
