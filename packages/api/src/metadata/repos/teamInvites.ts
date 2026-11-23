import { randomBytes } from 'node:crypto';

import { DuplicateKeyError } from '@/metadata/errors';
import { type Id, isValidId, newId } from '@/metadata/ids';
import { getDoc, parseRows, type RepoDeps } from '@/metadata/repos/docs';
import { iso, toDate } from '@/metadata/schemas/common';
import {
  INVITE_TTL_MS,
  type ITeamInvite,
  type TeamInviteDoc,
  TeamInviteDocSchema,
  type TeamInviteInput,
} from '@/metadata/schemas/teamInvite';
import { claimUnique, releaseUnique, resolveUnique } from '@/metadata/unique';

const MEMBER = 'invite_member';
const TOKEN = 'invite_token';

/**
 * Upper bound a request that lost the `{teamId, email}` claim waits for the
 * winner's invite to appear (D13). The winner's claim and insert are two KV
 * writes a few milliseconds apart; past this, the claim counts as abandoned.
 */
export const INVITE_CLAIM_WAIT_MS = 2000;

function toInvite(id: Id, d: TeamInviteDoc): ITeamInvite {
  return {
    ...d,
    _id: id,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  };
}

/**
 * `team_invites/<id>`. The Mongo `{teamId, email}` unique index and the 30d
 * TTL index become a lookup doc and KV expiry; claims expire with the invite.
 */
export class TeamInviteRepository {
  private readonly now: () => Date;

  constructor(private readonly deps: RepoDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private get kv() {
    return this.deps.kv;
  }

  private readonly inviteExists = async (id: string) =>
    (await this.kv.get('team_invites', id)) != null;

  /**
   * Stale-owner check for the member claim (D13). A claim with no invite yet
   * is usually a winner between its claim and its insert, not a crash, so
   * poll the invite by KV get (read-your-writes) for up to
   * INVITE_CLAIM_WAIT_MS before treating the claim as abandoned.
   */
  private readonly inviteAppears = async (id: string) => {
    const deadline = Date.now() + INVITE_CLAIM_WAIT_MS;
    for (let delay = 10; ; delay = Math.min(delay * 2, 200)) {
      if (await this.inviteExists(id)) return true;
      const left = deadline - Date.now();
      if (left <= 0) return false;
      await new Promise(r => setTimeout(r, Math.min(delay, left)));
    }
  };

  async getById(id: Id): Promise<ITeamInvite | null> {
    if (!isValidId(id)) return null;
    const doc = await getDoc(this.kv, TeamInviteDocSchema, 'team_invites', id);
    return doc ? toInvite(id, doc) : null;
  }

  async getByTeamEmail(teamId: Id, email: string): Promise<ITeamInvite | null> {
    const lower = email.toLowerCase();
    const id = await resolveUnique(this.kv, MEMBER, [teamId, lower]);
    const invite = id == null ? null : await this.getById(id);
    return invite?.teamId === teamId && invite.email === lower ? invite : null;
  }

  async getByToken(token: string): Promise<ITeamInvite | null> {
    const id = await resolveUnique(this.kv, TOKEN, [token]);
    const invite = id == null ? null : await this.getById(id);
    return invite?.token === token ? invite : null;
  }

  /**
   * The pending invite for `{teamId, email}`, created if absent. A concurrent
   * create returns the winner's invite, so the call is idempotent.
   */
  async getOrCreate(teamId: Id, input: TeamInviteInput): Promise<ITeamInvite> {
    const email = input.email.toLowerCase();
    const existing = await this.getByTeamEmail(teamId, email);
    if (existing) return existing;
    const now = this.now();
    const id = newId(now);
    const expiry = new Date(now.getTime() + INVITE_TTL_MS);
    const doc: TeamInviteDoc = {
      teamId,
      ...(input.name != null ? { name: input.name } : {}),
      email,
      token: randomBytes(32).toString('hex'),
      createdAt: iso(now),
      updatedAt: iso(now),
    };
    try {
      await claimUnique(this.kv, MEMBER, [teamId, email], id, {
        expiry,
        ownerExists: this.inviteAppears,
        now: this.now,
      });
    } catch (err) {
      if (!(err instanceof DuplicateKeyError)) throw err;
      // The owner's invite appeared while we waited, or the claim moved to
      // a newer owner whose invite did; read whichever holds the claim.
      const winner = await this.getByTeamEmail(teamId, email);
      if (winner) return winner;
      throw err;
    }
    try {
      await claimUnique(this.kv, TOKEN, [doc.token], id, { expiry });
      await this.kv.insert('team_invites', id, doc, { expiry });
    } catch (err) {
      await this.releaseClaims(id, doc);
      throw err;
    }
    // A stall longer than INVITE_CLAIM_WAIT_MS between our claim and insert
    // lets another request take the claim over. Its invite is the one
    // getByTeamEmail resolves, so drop ours and return it.
    const holder = await resolveUnique(this.kv, MEMBER, [teamId, email]);
    if (holder !== id) {
      await this.kv.remove('team_invites', id);
      await releaseUnique(this.kv, TOKEN, [doc.token], id);
      const winner = holder == null ? null : await this.waitForInvite(holder);
      if (winner) return winner;
      throw new DuplicateKeyError(MEMBER);
    }
    return toInvite(id, doc);
  }

  /** The invite `id` once its insert lands, within INVITE_CLAIM_WAIT_MS. */
  private async waitForInvite(id: Id): Promise<ITeamInvite | null> {
    return (await this.inviteAppears(id)) ? this.getById(id) : null;
  }

  async listByTeam(teamId: Id): Promise<ITeamInvite[]> {
    const rows = await this.deps.find.find<unknown>('team_invites', {
      where: { teamId },
      orderBy: [{ field: 'createdAt', dir: 'asc' }],
    });
    return parseRows(TeamInviteDocSchema, 'team_invites', rows, toInvite);
  }

  private async releaseClaims(id: Id, doc: TeamInviteDoc): Promise<void> {
    await releaseUnique(this.kv, TOKEN, [doc.token], id);
    await releaseUnique(this.kv, MEMBER, [doc.teamId, doc.email], id);
  }

  /** Deletes the invite when it belongs to `teamId`; false otherwise. */
  async deleteForTeam(teamId: Id, id: Id): Promise<boolean> {
    if (!isValidId(id)) return false;
    const got = await this.kv.get<unknown>('team_invites', id);
    if (!got) return false;
    const doc = TeamInviteDocSchema.parse(got.value);
    if (doc.teamId !== teamId) return false;
    if (!(await this.kv.remove('team_invites', id, { cas: got.cas }))) {
      return false;
    }
    await this.releaseClaims(id, doc);
    return true;
  }

  /** Removes an accepted invite; a second call is a no-op. */
  async consume(id: Id): Promise<void> {
    const doc = await getDoc(this.kv, TeamInviteDocSchema, 'team_invites', id);
    if (!doc) return;
    await this.kv.remove('team_invites', id);
    await this.releaseClaims(id, doc);
  }
}
