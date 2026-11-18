import { createHash } from 'node:crypto';

import { DuplicateKeyError } from '@/metadata/errors';
import type { MetaKv } from '@/metadata/types';

/**
 * Cross-node uniqueness without unique indexes (plan D9, §2.2): one lookup
 * document per unique tuple in `unique_keys`, created with KV insert so the
 * Data service rejects the second writer. Parts are hashed so keys stay
 * short and never leak emails or names into document keys.
 */
export type UniqueDoc = { kind: string; owner: string; createdAt: string };

export function uniqueKey(kind: string, parts: readonly string[]): string {
  if (!/^[a-z][a-z0-9_]*$/.test(kind)) {
    throw new Error('Unique kind must be lower snake case');
  }
  const digest = createHash('sha256')
    .update(JSON.stringify(parts))
    .digest('hex');
  return `uniq::${kind}::${digest}`;
}

export type ClaimOptions = {
  expiry?: Date;
  now?: () => Date;
  /**
   * Reports whether the current owner still exists. A claim left behind by a
   * crash between the lookup insert and the entity write is taken over.
   */
  ownerExists?: (owner: string) => Promise<boolean>;
};

/** Idempotent for the same owner; DuplicateKeyError for any other owner. */
export async function claimUnique(
  kv: MetaKv,
  kind: string,
  parts: readonly string[],
  owner: string,
  o: ClaimOptions = {},
): Promise<void> {
  const key = uniqueKey(kind, parts);
  const doc: UniqueDoc = {
    kind,
    owner,
    createdAt: (o.now ?? (() => new Date()))().toISOString(),
  };
  try {
    await kv.insert('unique_keys', key, doc, { expiry: o.expiry });
    return;
  } catch (err) {
    if (!(err instanceof DuplicateKeyError)) throw err;
  }
  const existing = await kv.get<UniqueDoc>('unique_keys', key);
  if (existing == null) {
    // Released between our insert and read: try once more.
    await kv.insert('unique_keys', key, doc, { expiry: o.expiry });
    return;
  }
  if (existing.value.owner === owner) return;
  if (o.ownerExists && !(await o.ownerExists(existing.value.owner))) {
    await kv.replace('unique_keys', key, doc, {
      cas: existing.cas,
      expiry: o.expiry,
    });
    return;
  }
  throw new DuplicateKeyError(kind);
}

export async function resolveUnique(
  kv: MetaKv,
  kind: string,
  parts: readonly string[],
): Promise<string | null> {
  const doc = await kv.get<UniqueDoc>('unique_keys', uniqueKey(kind, parts));
  return doc?.value.owner ?? null;
}

/** Removes the claim only if `owner` still holds it. */
export async function releaseUnique(
  kv: MetaKv,
  kind: string,
  parts: readonly string[],
  owner: string,
): Promise<boolean> {
  const key = uniqueKey(kind, parts);
  const doc = await kv.get<UniqueDoc>('unique_keys', key);
  if (doc == null || doc.value.owner !== owner) return false;
  return kv.remove('unique_keys', key, { cas: doc.cas });
}
