import { CasConflictError, DuplicateKeyError } from '@/metadata/errors';
import type { Lease, LockService, MetaKv } from '@/metadata/types';

type LockDoc = { owner: string; acquiredAt: string; expiresAt: string };

const MIN_TTL_MS = 1000;

/**
 * Leases for singleton work (alert task, OpAMP push, startup provisioning)
 * as `lock::<name>` documents with a KV expiry in the `system` collection.
 * Couchbase expiry has one-second resolution, so TTLs are at least 1s, and
 * an expired document is treated as free even before the server purges it.
 */
export class KvLockService implements LockService {
  constructor(
    private readonly kv: MetaKv,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private key(name: string): string {
    if (!/^[A-Za-z0-9:_-]{1,200}$/.test(name)) {
      throw new Error('Lock name must be 1-200 of [A-Za-z0-9:_-]');
    }
    return `lock::${name}`;
  }

  private doc(owner: string, ttlMs: number) {
    const now = this.now();
    const expiresAt = new Date(now.getTime() + Math.max(ttlMs, MIN_TTL_MS));
    const value: LockDoc = {
      owner,
      acquiredAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    };
    return { value, expiresAt };
  }

  async acquire(
    name: string,
    ttlMs: number,
    owner: string,
  ): Promise<Lease | null> {
    const key = this.key(name);
    const { value, expiresAt } = this.doc(owner, ttlMs);
    try {
      const cas = await this.kv.insert('system', key, value, {
        expiry: expiresAt,
      });
      return { name, owner, cas, expiresAt };
    } catch (err) {
      if (!(err instanceof DuplicateKeyError)) throw err;
    }
    const held = await this.kv.get<LockDoc>('system', key);
    if (held && new Date(held.value.expiresAt) > this.now()) return null;
    try {
      const cas = held
        ? await this.kv.replace('system', key, value, {
            cas: held.cas,
            expiry: expiresAt,
          })
        : await this.kv.insert('system', key, value, { expiry: expiresAt });
      return { name, owner, cas, expiresAt };
    } catch (err) {
      if (err instanceof CasConflictError || err instanceof DuplicateKeyError) {
        return null;
      }
      throw err;
    }
  }

  async renew(lease: Lease, ttlMs: number): Promise<Lease | null> {
    const { value, expiresAt } = this.doc(lease.owner, ttlMs);
    try {
      const cas = await this.kv.replace('system', this.key(lease.name), value, {
        cas: lease.cas,
        expiry: expiresAt,
      });
      return { ...lease, cas, expiresAt };
    } catch (err) {
      if (err instanceof CasConflictError) return null;
      if (err instanceof Error && err.name === 'NotFoundError') return null;
      throw err;
    }
  }

  async release(lease: Lease): Promise<void> {
    try {
      await this.kv.remove('system', this.key(lease.name), { cas: lease.cas });
    } catch (err) {
      // Someone else holds it now; theirs to release.
      if (!(err instanceof CasConflictError)) throw err;
    }
  }
}
