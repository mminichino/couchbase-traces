import { getMetadataStore } from '@/metadata';
import type { UserDisplay } from '@/metadata/schemas/user';

type Ref = { toString(): string } | null | undefined;

export type UserDisplays = Map<string, UserDisplay>;

/**
 * One batched read for every referenced user. Users live in the metadata
 * store, so Mongoose `populate('createdBy', 'email name')` can't reach them.
 */
export function loadUserDisplays(refs: Ref[]): Promise<UserDisplays> {
  return getMetadataStore().users.getDisplay(
    refs.map(r => (r == null ? r : r.toString())),
  );
}

/** Populate semantics: an unset ref stays unset; a dangling one is null. */
export function userDisplay(
  users: UserDisplays,
  ref: Ref,
): UserDisplay | null | undefined {
  if (ref == null) return ref;
  return users.get(ref.toString()) ?? null;
}

/**
 * Replaces each `keys` ref on a plain row with the user's display fields. The
 * row keeps its declared type, as an untyped `populate` call did.
 */
export function applyUserDisplays<T extends object>(
  users: UserDisplays,
  row: T,
  keys: (keyof T & string)[],
): T {
  const replace = new Set<string>(keys);
  const out = Object.fromEntries(
    Object.entries(row).map(([k, v]) =>
      replace.has(k) ? [k, userDisplay(users, toRef(v))] : [k, v],
    ),
  );
  return out as T;
}

function toRef(v: unknown): Ref {
  if (v == null) return v;
  return typeof v === 'string' || typeof v === 'object' ? v : String(v);
}
