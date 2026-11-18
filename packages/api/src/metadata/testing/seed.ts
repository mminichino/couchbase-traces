import { newId } from '@/metadata/ids';
import type { MetaCollection, MetaKv } from '@/metadata/types';

/**
 * Integration-test seeding over MetaKv. Entity helpers (`seed.team`,
 * `seed.user`, …) are added with each slice and replace `Model.create(...)`
 * in the ported tests. C0 only seeds raw documents.
 */
export async function seedDocs<T extends object>(
  kv: MetaKv,
  collection: MetaCollection,
  docs: T[],
): Promise<string[]> {
  const keys: string[] = [];
  for (const doc of docs) {
    const key = newId();
    await kv.insert(collection, key, doc);
    keys.push(key);
  }
  return keys;
}
