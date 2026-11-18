import { METADATA_SCHEMA_KEY } from '@couchbase-traces/common-utils/dist/couchbase/metadataKeyspace';

import {
  CasConflictError,
  DuplicateKeyError,
  NotFoundError,
  SchemaVersionError,
} from '@/metadata/errors';
import { newId } from '@/metadata/ids';
import { KvLockService } from '@/metadata/lock';
import {
  assertSchemaVersion,
  METADATA_SCHEMA_VERSION,
  writeSchemaVersion,
} from '@/metadata/schemaVersion';
import type { MetaKv } from '@/metadata/types';
import { claimUnique, releaseUnique, resolveUnique } from '@/metadata/unique';

export type ContractHarness = {
  kv: MetaKv;
  now: () => Date;
  /** Real sleep on Couchbase; advances a fake clock in memory. */
  sleep: (ms: number) => Promise<void>;
};

/**
 * Behavior both metadata backends must share (plan §2, C0). Entity
 * repository cases join this suite slice by slice. Keys are prefixed with a
 * fresh id so runs against a shared bucket never collide.
 */
export function describeMetadataContract(
  backend: string,
  setup: () => Promise<ContractHarness>,
): void {
  describe(`metadata contract: ${backend}`, () => {
    let h: ContractHarness;
    let p: string;
    beforeAll(async () => {
      h = await setup();
    });
    beforeEach(() => {
      p = `t${newId()}`;
    });

    describe('kv', () => {
      it('returns null for a missing key', async () => {
        expect(await h.kv.get('teams', `${p}::none`)).toBeNull();
      });

      it('inserts once and reports the collision', async () => {
        await h.kv.insert('teams', `${p}::a`, { name: 'a', n: [1, 2] });
        expect((await h.kv.get('teams', `${p}::a`))?.value).toEqual({
          name: 'a',
          n: [1, 2],
        });
        await expect(
          h.kv.insert('teams', `${p}::a`, { name: 'b' }),
        ).rejects.toBeInstanceOf(DuplicateKeyError);
      });

      it('rejects a replace with a stale CAS', async () => {
        const first = await h.kv.insert('teams', `${p}::c`, { v: 1 });
        const second = await h.kv.replace(
          'teams',
          `${p}::c`,
          { v: 2 },
          { cas: first },
        );
        await expect(
          h.kv.replace('teams', `${p}::c`, { v: 3 }, { cas: first }),
        ).rejects.toBeInstanceOf(CasConflictError);
        await h.kv.replace('teams', `${p}::c`, { v: 4 }, { cas: second });
        expect((await h.kv.get('teams', `${p}::c`))?.value).toEqual({ v: 4 });
      });

      it('fails to replace a missing key', async () => {
        await expect(
          h.kv.replace('teams', `${p}::missing`, {}),
        ).rejects.toBeInstanceOf(NotFoundError);
      });

      it('removes once, honoring CAS', async () => {
        const cas = await h.kv.insert('teams', `${p}::r`, { v: 1 });
        await h.kv.replace('teams', `${p}::r`, { v: 2 });
        await expect(
          h.kv.remove('teams', `${p}::r`, { cas }),
        ).rejects.toBeInstanceOf(CasConflictError);
        expect(await h.kv.remove('teams', `${p}::r`)).toBe(true);
        expect(await h.kv.remove('teams', `${p}::r`)).toBe(false);
      });

      it('multi-gets only the keys that exist', async () => {
        await h.kv.insert('users', `${p}::1`, { i: 1 });
        await h.kv.insert('users', `${p}::2`, { i: 2 });
        const got = await h.kv.getMany('users', [
          `${p}::1`,
          `${p}::2`,
          `${p}::3`,
        ]);
        expect([...got.entries()].sort()).toEqual([
          [`${p}::1`, { i: 1 }],
          [`${p}::2`, { i: 2 }],
        ]);
      });

      it('clears expiry on mutation unless preserveExpiry is set', async () => {
        const expiry = new Date(h.now().getTime() + 3_600_000);
        await h.kv.insert('sessions', `${p}::s`, { v: 1 }, { expiry });
        expect((await h.kv.get('sessions', `${p}::s`))?.expiry).toBeDefined();
        await h.kv.replace(
          'sessions',
          `${p}::s`,
          { v: 2 },
          { preserveExpiry: true },
        );
        expect((await h.kv.get('sessions', `${p}::s`))?.expiry).toBeDefined();
        await h.kv.replace('sessions', `${p}::s`, { v: 3 });
        expect((await h.kv.get('sessions', `${p}::s`))?.expiry).toBeUndefined();
        expect(await h.kv.touch('sessions', `${p}::s`, expiry)).toBe(true);
        expect((await h.kv.get('sessions', `${p}::s`))?.expiry).toBeDefined();
        expect(await h.kv.touch('sessions', `${p}::none`, expiry)).toBe(false);
      });

      it('stops returning a document after it expires', async () => {
        const expiry = new Date(h.now().getTime() + 1000);
        await h.kv.insert('sessions', `${p}::e`, { v: 1 }, { expiry });
        await h.sleep(2500);
        expect(await h.kv.get('sessions', `${p}::e`)).toBeNull();
        await h.kv.insert('sessions', `${p}::e`, { v: 2 });
      });
    });

    describe('unique keys', () => {
      it('is idempotent per owner and exclusive across owners', async () => {
        const parts = [p, 'a@example.com'];
        await claimUnique(h.kv, 'user_email', parts, 'u1');
        await claimUnique(h.kv, 'user_email', parts, 'u1');
        await expect(
          claimUnique(h.kv, 'user_email', parts, 'u2'),
        ).rejects.toBeInstanceOf(DuplicateKeyError);
        expect(await resolveUnique(h.kv, 'user_email', parts)).toBe('u1');
        expect(await releaseUnique(h.kv, 'user_email', parts, 'u2')).toBe(
          false,
        );
        expect(await releaseUnique(h.kv, 'user_email', parts, 'u1')).toBe(true);
        await claimUnique(h.kv, 'user_email', parts, 'u2');
        expect(await resolveUnique(h.kv, 'user_email', parts)).toBe('u2');
      });

      it('takes over a claim whose owner no longer exists', async () => {
        const parts = [p, 'orphan'];
        await claimUnique(h.kv, 'webhook_name', parts, 'gone');
        await claimUnique(h.kv, 'webhook_name', parts, 'new', {
          ownerExists: async owner => owner !== 'gone',
        });
        expect(await resolveUnique(h.kv, 'webhook_name', parts)).toBe('new');
      });

      it('lets exactly one of many concurrent claimants win', async () => {
        const parts = [p, 'race'];
        const results = await Promise.allSettled(
          Array.from({ length: 10 }, (_, i) =>
            claimUnique(h.kv, 'team_name', parts, `owner${i}`),
          ),
        );
        expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
      });
    });

    describe('leases', () => {
      it('excludes a second holder until released', async () => {
        const locks = new KvLockService(h.kv, h.now);
        const lease = await locks.acquire(`${p}:alerts`, 60_000, 'a');
        expect(lease).not.toBeNull();
        expect(await locks.acquire(`${p}:alerts`, 60_000, 'b')).toBeNull();
        await locks.release(lease!);
        expect(await locks.acquire(`${p}:alerts`, 60_000, 'b')).not.toBeNull();
      });

      it('renews its own lease and loses it after a takeover', async () => {
        const locks = new KvLockService(h.kv, h.now);
        const lease = await locks.acquire(`${p}:opamp`, 1000, 'a');
        const renewed = await locks.renew(lease!, 1000);
        expect(renewed).not.toBeNull();
        await h.sleep(2500);
        const taken = await locks.acquire(`${p}:opamp`, 60_000, 'b');
        expect(taken?.owner).toBe('b');
        expect(await locks.renew(renewed!, 1000)).toBeNull();
      });
    });

    describe('schema version', () => {
      it('accepts the current version and rejects a newer one', async () => {
        await writeSchemaVersion(h.kv);
        expect(await assertSchemaVersion(h.kv)).toBe(METADATA_SCHEMA_VERSION);
        await expect(
          assertSchemaVersion(h.kv, METADATA_SCHEMA_VERSION - 1),
        ).rejects.toBeInstanceOf(SchemaVersionError);
        const doc = await h.kv.get<{ provisionedAt: string }>(
          'system',
          METADATA_SCHEMA_KEY,
        );
        expect(doc?.value.provisionedAt).toEqual(expect.any(String));
      });
    });
  });
}
