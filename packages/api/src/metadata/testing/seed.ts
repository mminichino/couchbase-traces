import { v4 as uuidv4 } from 'uuid';

import { getMetadataStore } from '@/metadata';
import { type Id, newId } from '@/metadata/ids';
import { iso } from '@/metadata/schemas/common';
import type { ITeam, TeamDoc } from '@/metadata/schemas/team';
import { TeamDocSchema } from '@/metadata/schemas/team';
import type { IUser, UserDoc } from '@/metadata/schemas/user';
import { UserDocSchema } from '@/metadata/schemas/user';
import type { MetaCollection, MetaKv } from '@/metadata/types';
import { claimUnique } from '@/metadata/unique';

/**
 * Integration-test seeding. These replace `Team.create`, `User.create`, and
 * `Model.updateOne` in the ported tests, so they write documents directly
 * and skip rules the repositories enforce (the single-team claim, password
 * required), the way the Mongoose calls did.
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

type TeamSeed = { name: string } & Partial<Omit<TeamDoc, 'name'>>;

/** Another team beside the singleton, for cross-team isolation tests. */
export async function seedTeam(input: TeamSeed): Promise<ITeam> {
  const store = getMetadataStore();
  const id = newId();
  const at = iso(new Date());
  const doc = TeamDocSchema.parse({
    hookId: uuidv4(),
    apiKey: uuidv4(),
    createdAt: at,
    updatedAt: at,
    ...input,
  });
  await claimUnique(store.kv, 'team_api_key', [doc.apiKey], id);
  await store.kv.insert('teams', id, doc);
  return (await store.teams.getById(id))!;
}

type DateFields = 'expiresAt' | 'lastUsedAt' | 'revokedAt';
type UserSeed = { email: string; team: Id | { toString(): string } } & Partial<
  Omit<UserDoc, 'email' | 'team' | DateFields>
> &
  Partial<Record<DateFields, Date | null>>;

function dates(input: Partial<Record<DateFields, Date | null>>) {
  const out: Partial<Record<DateFields, string | null>> = {};
  const conv = (v: Date | null) => (v === null ? null : iso(v));
  if (input.expiresAt !== undefined) out.expiresAt = conv(input.expiresAt);
  if (input.lastUsedAt !== undefined) out.lastUsedAt = conv(input.lastUsedAt);
  if (input.revokedAt !== undefined) out.revokedAt = conv(input.revokedAt);
  return out;
}

/** A user without a password, as `User.create` made one. */
export async function seedUser(input: UserSeed): Promise<IUser> {
  const store = getMetadataStore();
  const id = newId();
  const at = iso(new Date());
  const doc = UserDocSchema.parse({
    accessKey: uuidv4(),
    createdAt: at,
    updatedAt: at,
    ...input,
    ...dates(input),
    email: input.email.toLowerCase(),
    team: input.team.toString(),
  });
  await claimUnique(store.kv, 'user_email', [doc.email], id);
  await claimUnique(store.kv, 'user_access_key', [doc.accessKey], id);
  await store.kv.insert('users', id, doc);
  return (await store.users.getById(id))!;
}

/** `User.updateOne({ _id }, patch)` for fields no repository method sets. */
export async function patchUser(
  id: Id,
  patch: Partial<Omit<UserDoc, DateFields>> &
    Partial<Record<DateFields, Date | null>>,
): Promise<void> {
  const kv = getMetadataStore().kv;
  const cur = await kv.get<UserDoc>('users', id);
  if (!cur) throw new Error(`users/${id} not found`);
  await kv.replace('users', id, { ...cur.value, ...patch, ...dates(patch) });
}

/** `Team.findByIdAndUpdate(id, patch)`. */
export async function patchTeam(
  id: Id,
  patch: Partial<TeamDoc>,
): Promise<void> {
  const kv = getMetadataStore().kv;
  const cur = await kv.get<TeamDoc>('teams', id);
  if (!cur) throw new Error(`teams/${id} not found`);
  await kv.replace('teams', id, { ...cur.value, ...patch });
}

/** The raw stored document, including the password hash. */
export async function getUserDoc(id: Id): Promise<UserDoc | null> {
  return (await getMetadataStore().kv.get<UserDoc>('users', id))?.value ?? null;
}

type IdLike = Id | { toString(): string } | null | undefined;

/** `User.findById(id)`; accepts an ObjectId the way Mongoose did. */
export function findUser(id: IdLike): Promise<IUser | null> {
  if (id == null) return Promise.resolve(null);
  return getMetadataStore().users.getById(id.toString());
}

/** `Team.findById(id)`. */
export function findTeam(id: IdLike): Promise<ITeam | null> {
  if (id == null) return Promise.resolve(null);
  return getMetadataStore().teams.getById(id.toString());
}
