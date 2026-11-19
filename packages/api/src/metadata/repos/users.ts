import { createHash } from 'node:crypto';

import type { OnboardingTaskId } from '@couchbase-traces/common-utils/dist/types';
import { v4 as uuidv4 } from 'uuid';

import {
  AUTH_ERRORS,
  hashPassword,
  UserExistsError,
} from '@/metadata/auth/password';
import { DuplicateKeyError } from '@/metadata/errors';
import { type Id, isValidId, newId } from '@/metadata/ids';
import { reassignAlertsInTx } from '@/metadata/repos/alertTx';
import {
  getDoc,
  mutateDoc,
  parseRows,
  type RepoDeps,
} from '@/metadata/repos/docs';
import { iso, toDate } from '@/metadata/schemas/common';
import {
  type IUser,
  type UserDisplay,
  type UserDoc,
  UserDocSchema,
  type UserWithSecret,
  type VirtualUserInput,
} from '@/metadata/schemas/user';
import { claimUnique, releaseUnique, resolveUnique } from '@/metadata/unique';

export const ORG_API_KEY_PREFIX = 'hdx_org_';

export function hashOrgApiKey(key: string) {
  return createHash('sha256').update(key).digest('hex');
}

const EMAIL = 'user_email';
const ACCESS_KEY = 'user_access_key';

function toUser(id: Id, d: UserDoc): UserWithSecret {
  return {
    ...d,
    _id: id,
    team: d.team,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
    expiresAt: toDate(d.expiresAt),
    lastUsedAt: toDate(d.lastUsedAt),
    revokedAt: toDate(d.revokedAt),
    // Always true; kept for the wire shape.
    hasPasswordAuth: true,
  };
}

function withoutSecret(u: UserWithSecret): IUser {
  const { hash: _hash, ...rest } = u;
  return rest;
}

const isOrgKey = (d: UserDoc) =>
  d.isVirtual && d.createdBy != null && d.revokedAt == null;

export class UserRepository {
  private readonly now: () => Date;

  constructor(private readonly deps: RepoDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private get kv() {
    return this.deps.kv;
  }

  private readonly userExists = async (id: string) =>
    (await this.kv.get('users', id)) != null;

  /** Claims the email and access key, then writes the doc; undone on failure. */
  private async insert(id: Id, doc: UserDoc): Promise<void> {
    try {
      await claimUnique(this.kv, EMAIL, [doc.email], id, {
        ownerExists: this.userExists,
      });
    } catch (err) {
      if (err instanceof DuplicateKeyError) {
        throw new UserExistsError();
      }
      throw err;
    }
    try {
      await claimUnique(this.kv, ACCESS_KEY, [doc.accessKey], id);
      await this.kv.insert('users', id, doc);
    } catch (err) {
      await releaseUnique(this.kv, ACCESS_KEY, [doc.accessKey], id);
      await releaseUnique(this.kv, EMAIL, [doc.email], id);
      throw err;
    }
  }

  private newDoc(
    fields: Pick<UserDoc, 'email' | 'team'> & Partial<UserDoc>,
  ): UserDoc {
    const at = iso(this.now());
    return {
      accessKey: uuidv4(),
      isVirtual: false,
      onboardingData: { completedTasks: [], isDismissed: false },
      createdAt: at,
      updatedAt: at,
      ...fields,
      email: fields.email.toLowerCase(),
    };
  }

  /** Registers a user: legacy error names, scrypt hash (D4). */
  async register(
    input: { email: string; name?: string; team: Id },
    password: string,
  ): Promise<IUser> {
    if (!password) throw new Error(AUTH_ERRORS.missingPassword);
    if (!input.email) throw new Error(AUTH_ERRORS.missingUsername);
    const hash = await hashPassword(password);
    const id = newId(this.now());
    const doc = this.newDoc({ ...input, hash });
    await this.insert(id, doc);
    return withoutSecret(toUser(id, doc));
  }

  async createVirtual(input: VirtualUserInput): Promise<IUser> {
    const id = newId(this.now());
    const doc = this.newDoc({
      email: input.email,
      name: input.name,
      team: input.teamId,
      isVirtual: true,
      ...(input.accessKey ? { accessKey: input.accessKey } : {}),
      // null (never expires) is stored as null.
      ...(input.expiresAt !== undefined
        ? { expiresAt: input.expiresAt && iso(input.expiresAt) }
        : {}),
      ...(input.createdBy ? { createdBy: input.createdBy } : {}),
    });
    await this.insert(id, doc);
    return withoutSecret(toUser(id, doc));
  }

  async getByIdWithSecret(id: Id): Promise<UserWithSecret | null> {
    if (!isValidId(id)) return null;
    const doc = await getDoc(this.kv, UserDocSchema, 'users', id);
    return doc ? toUser(id, doc) : null;
  }

  async getById(id: Id): Promise<IUser | null> {
    const u = await this.getByIdWithSecret(id);
    return u ? withoutSecret(u) : null;
  }

  async getByEmailWithSecret(email: string): Promise<UserWithSecret | null> {
    const lower = email.toLowerCase();
    const id = await resolveUnique(this.kv, EMAIL, [lower]);
    const user = id == null ? null : await this.getByIdWithSecret(id);
    return user?.email === lower ? user : null;
  }

  async getByEmail(email: string): Promise<IUser | null> {
    const u = await this.getByEmailWithSecret(email);
    return u ? withoutSecret(u) : null;
  }

  /**
   * Org keys are stored hashed; only the prefixed plaintext reaches a service
   * account, so presenting the stored hash itself never authenticates.
   */
  async getByAccessKey(key: string, now = this.now()): Promise<IUser | null> {
    const orgKey = key.startsWith(ORG_API_KEY_PREFIX);
    const stored = orgKey ? hashOrgApiKey(key) : key;
    const id = await resolveUnique(this.kv, ACCESS_KEY, [stored]);
    if (id == null || !isValidId(id)) return null;
    const doc = await getDoc(this.kv, UserDocSchema, 'users', id);
    if (doc?.accessKey !== stored) return null;
    if (orgKey) {
      if (!isOrgKey(doc)) return null;
      if (doc.expiresAt != null && new Date(doc.expiresAt) <= now) return null;
    } else if (doc.isVirtual) {
      return null;
    }
    return withoutSecret(toUser(id, doc));
  }

  async listByTeam(teamId: Id): Promise<IUser[]> {
    const rows = await this.deps.find.find<unknown>('users', {
      where: { team: teamId, isVirtual: false },
      orderBy: [{ field: 'createdAt', dir: 'asc' }],
    });
    return parseRows(UserDocSchema, 'users', rows, (k, d) =>
      withoutSecret(toUser(k, d)),
    );
  }

  countPeople(teamId: Id): Promise<number> {
    return this.deps.find.count('users', {
      where: { team: teamId, isVirtual: false },
    });
  }

  /** Active org keys, newest first. */
  async listOrgKeys(teamId: Id): Promise<IUser[]> {
    const rows = await this.deps.find.find<unknown>('users', {
      where: { team: teamId, isVirtual: true },
      present: ['createdBy'],
      orderBy: [{ field: 'createdAt', dir: 'desc' }],
    });
    return parseRows(UserDocSchema, 'users', rows, (k, d) =>
      isOrgKey(d) ? [withoutSecret(toUser(k, d))] : [],
    ).flat();
  }

  async getDisplay(
    ids: (Id | null | undefined)[],
  ): Promise<Map<Id, UserDisplay>> {
    const valid = [...new Set(ids.filter((i): i is Id => isValidId(i)))];
    const docs = await this.kv.getMany<unknown>('users', valid);
    const out = new Map<Id, UserDisplay>();
    for (const [id, raw] of docs) {
      const parsed = UserDocSchema.safeParse(raw);
      if (!parsed.success) continue;
      out.set(id, {
        _id: id,
        email: parsed.data.email,
        ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }),
      });
    }
    return out;
  }

  /** Returns the new doc, or null when `fn` skips (returns null) or id is gone. */
  private async update(
    id: Id,
    fn: (cur: UserDoc) => UserDoc | null,
  ): Promise<IUser | null> {
    if (!isValidId(id)) return null;
    let skipped = false;
    const res = await mutateDoc(this.kv, UserDocSchema, 'users', id, cur => {
      const next = fn(cur);
      skipped = next === null;
      return next && { ...next, updatedAt: iso(this.now()) };
    });
    return res && !skipped ? withoutSecret(toUser(id, res.after)) : null;
  }

  /**
   * One key per user and no grace period: getByAccessKey reads uncached on
   * every bearer request, so the old key stops working when this returns.
   */
  async rotateAccessKey(id: Id): Promise<IUser | null> {
    const accessKey = uuidv4();
    await claimUnique(this.kv, ACCESS_KEY, [accessKey], id);
    let previous: string | undefined;
    const user = await this.update(id, cur => {
      previous = cur.accessKey;
      return { ...cur, accessKey };
    });
    if (user == null) {
      await releaseUnique(this.kv, ACCESS_KEY, [accessKey], id);
      return null;
    }
    if (previous) await releaseUnique(this.kv, ACCESS_KEY, [previous], id);
    return user;
  }

  async setPassword(id: Id, password: string): Promise<IUser | null> {
    if (!password) throw new Error(AUTH_ERRORS.missingPassword);
    const hash = await hashPassword(password);
    return this.update(id, cur => ({ ...cur, hash }));
  }

  /** Lazy rehash after a login on old parameters; skipped if hash changed. */
  async replacePasswordHash(id: Id, from: string, to: string): Promise<void> {
    await this.update(id, cur =>
      cur.hash === from ? { ...cur, hash: to } : null,
    );
  }

  addOnboardingTask(id: Id, task: OnboardingTaskId): Promise<IUser | null> {
    return this.update(id, cur => ({
      ...cur,
      onboardingData: {
        ...cur.onboardingData,
        completedTasks: cur.onboardingData.completedTasks.includes(task)
          ? cur.onboardingData.completedTasks
          : [...cur.onboardingData.completedTasks, task],
      },
    }));
  }

  setOnboardingDismissed(id: Id, isDismissed: boolean): Promise<IUser | null> {
    return this.update(id, cur => ({
      ...cur,
      onboardingData: { ...cur.onboardingData, isDismissed },
    }));
  }

  /** Skips the write once recorded (hot paths) and for virtual users. */
  async recordOnboardingTask(id: Id, task: OnboardingTaskId): Promise<void> {
    await this.update(id, cur =>
      cur.isVirtual || cur.onboardingData.completedTasks.includes(task)
        ? null
        : {
            ...cur,
            onboardingData: {
              ...cur.onboardingData,
              completedTasks: [...cur.onboardingData.completedTasks, task],
            },
          },
    );
  }

  /** Writes only when the stored value is older than `staleBefore`. */
  async touchLastUsed(id: Id, at: Date, staleBefore: Date): Promise<void> {
    await this.update(id, cur =>
      cur.lastUsedAt != null && new Date(cur.lastUsedAt) >= staleBefore
        ? null
        : { ...cur, lastUsedAt: iso(at) },
    );
  }

  private updateOrgKey(teamId: Id, id: Id, fn: (cur: UserDoc) => UserDoc) {
    return this.update(id, cur =>
      cur.team === teamId && isOrgKey(cur) ? fn(cur) : null,
    );
  }

  setOrgKeyName(teamId: Id, id: Id, name: string): Promise<IUser | null> {
    return this.updateOrgKey(teamId, id, cur => ({ ...cur, name }));
  }

  revokeOrgKey(teamId: Id, id: Id, at: Date): Promise<IUser | null> {
    return this.updateOrgKey(teamId, id, cur => ({
      ...cur,
      revokedAt: iso(at),
    }));
  }

  /**
   * Deletes a non-virtual member of `teamId`, hands the alerts they created to
   * `heir`, and frees their claims. One transaction: the member count, the
   * delete, and the reassignment commit together, and the team document is
   * rewritten unchanged so two removals racing past the "last person" check
   * conflict and the loser re-reads the count.
   */
  async removeMember(
    teamId: Id,
    id: Id,
    heir: Id,
  ): Promise<'deleted' | 'not_found' | 'last_member'> {
    if (!isValidId(id)) return 'not_found';
    const outcome = await this.deps.tx.run(async tx => {
      const raw = await tx.get<unknown>('users', id);
      const doc = raw == null ? null : UserDocSchema.parse(raw);
      if (!doc || doc.team !== teamId || doc.isVirtual) return null;
      const team = await tx.get<unknown>('teams', teamId);
      if (team != null) await tx.replace('teams', teamId, team);
      const people = await tx.find('users', {
        where: { team: teamId, isVirtual: false },
        limit: 2,
      });
      if (people.length <= 1) return 'last_member' as const;
      await tx.remove('users', id);
      await reassignAlertsInTx(tx, teamId, id, heir, this.now());
      return doc;
    });
    if (outcome == null) return 'not_found';
    if (outcome === 'last_member') return outcome;
    await releaseUnique(this.kv, ACCESS_KEY, [outcome.accessKey], id);
    await releaseUnique(this.kv, EMAIL, [outcome.email], id);
    return 'deleted';
  }

  /** Tests and failed registrations only. */
  async remove(id: Id): Promise<boolean> {
    const doc = await getDoc(this.kv, UserDocSchema, 'users', id);
    if (!doc) return false;
    await this.kv.remove('users', id);
    await releaseUnique(this.kv, ACCESS_KEY, [doc.accessKey], id);
    await releaseUnique(this.kv, EMAIL, [doc.email], id);
    return true;
  }
}
