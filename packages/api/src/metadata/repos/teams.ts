import type { TeamQuerySettingsUpdate } from '@couchbase-traces/common-utils/dist/types';
import { v4 as uuidv4 } from 'uuid';

import { type Id, isValidId, newId } from '@/metadata/ids';
import {
  getDoc,
  mutateDoc,
  parseRows,
  type RepoDeps,
} from '@/metadata/repos/docs';
import { iso, toDate } from '@/metadata/schemas/common';
import {
  type ITeam,
  type TeamDoc,
  TeamDocSchema,
  type TeamInput,
} from '@/metadata/schemas/team';
import { claimUnique, releaseUnique, resolveUnique } from '@/metadata/unique';

const SINGLETON = 'team_singleton';
const API_KEY = 'team_api_key';

function toTeam(id: Id, d: TeamDoc): ITeam {
  return {
    ...d,
    _id: id,
    id,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  };
}

export class TeamRepository {
  private readonly now: () => Date;

  constructor(private readonly deps: RepoDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private get kv() {
    return this.deps.kv;
  }

  private readonly teamExists = async (id: string) =>
    (await this.kv.get('teams', id)) != null;

  /** isTeamExisting: the singleton claim, ignoring an orphan without a team. */
  async exists(): Promise<boolean> {
    return (await this.getOnly()) != null;
  }

  /**
   * The single team (plan D9). DuplicateKeyError('team_singleton') when one
   * already exists; a claim left by a crash before the team write is reused.
   */
  async createFirst(input: TeamInput): Promise<ITeam> {
    const id = newId(this.now());
    await claimUnique(this.kv, SINGLETON, [], id, {
      ownerExists: this.teamExists,
      now: this.now,
    });
    const at = iso(this.now());
    const doc: TeamDoc = {
      name: input.name,
      allowedAuthMethods: [],
      hookId: uuidv4(),
      apiKey: uuidv4(),
      collectorAuthenticationEnforced:
        input.collectorAuthenticationEnforced ?? false,
      isMetricsSeriesTableEnabled: false,
      createdAt: at,
      updatedAt: at,
    };
    try {
      await claimUnique(this.kv, API_KEY, [doc.apiKey], id);
      await this.kv.insert('teams', id, doc);
    } catch (err) {
      await releaseUnique(this.kv, API_KEY, [doc.apiKey], id);
      await releaseUnique(this.kv, SINGLETON, [], id);
      throw err;
    }
    return toTeam(id, doc);
  }

  /** Removes the team and its claims; tests and failed registrations only. */
  async remove(id: Id): Promise<boolean> {
    const doc = await getDoc(this.kv, TeamDocSchema, 'teams', id);
    if (!doc) return false;
    await this.kv.remove('teams', id);
    await releaseUnique(this.kv, API_KEY, [doc.apiKey], id);
    await releaseUnique(this.kv, SINGLETON, [], id);
    return true;
  }

  async getOnly(): Promise<ITeam | null> {
    const id = await resolveUnique(this.kv, SINGLETON, []);
    return id == null ? null : this.getById(id);
  }

  async getById(id: Id): Promise<ITeam | null> {
    if (!isValidId(id)) return null;
    const doc = await getDoc(this.kv, TeamDocSchema, 'teams', id);
    return doc ? toTeam(id, doc) : null;
  }

  async getByApiKey(apiKey: string): Promise<ITeam | null> {
    const id = await resolveUnique(this.kv, API_KEY, [apiKey]);
    const team = id == null ? null : await this.getById(id);
    return team?.apiKey === apiKey ? team : null;
  }

  async listAll(): Promise<ITeam[]> {
    const rows = await this.deps.find.find<unknown>('teams', {
      present: ['createdAt'],
      orderBy: [{ field: 'createdAt', dir: 'asc' }],
    });
    return parseRows(TeamDocSchema, 'teams', rows, toTeam);
  }

  private async update(
    id: Id,
    fn: (cur: TeamDoc) => TeamDoc,
  ): Promise<ITeam | null> {
    if (!isValidId(id)) return null;
    const res = await mutateDoc(this.kv, TeamDocSchema, 'teams', id, cur => ({
      ...fn(cur),
      updatedAt: iso(this.now()),
    }));
    return res ? toTeam(id, res.after) : null;
  }

  async rotateApiKey(id: Id): Promise<ITeam | null> {
    const apiKey = uuidv4();
    await claimUnique(this.kv, API_KEY, [apiKey], id);
    let previous: string | undefined;
    const team = await this.update(id, cur => {
      previous = cur.apiKey;
      return { ...cur, apiKey };
    });
    if (team == null) {
      await releaseUnique(this.kv, API_KEY, [apiKey], id);
      return null;
    }
    if (previous) await releaseUnique(this.kv, API_KEY, [previous], id);
    return team;
  }

  setName(id: Id, name: string): Promise<ITeam | null> {
    return this.update(id, cur => ({ ...cur, name }));
  }

  /** null removes a setting (Mongo `$unset`), undefined leaves it alone. */
  updateQuerySettings(
    id: Id,
    settings: TeamQuerySettingsUpdate,
  ): Promise<ITeam | null> {
    return this.update(id, cur => {
      const entries = Object.entries(settings);
      const unset = new Set(
        entries.filter(([, v]) => v === null).map(e => e[0]),
      );
      const merged = {
        ...cur,
        ...Object.fromEntries(entries.filter(([, v]) => v != null)),
      };
      return TeamDocSchema.parse(
        Object.fromEntries(
          Object.entries(merged).filter(([k]) => !unset.has(k)),
        ),
      );
    });
  }
}
