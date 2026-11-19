import { z } from 'zod';

import { DuplicateKeyError } from '@/metadata/errors';
import { type Id, newId } from '@/metadata/ids';
import { type RepoDeps } from '@/metadata/repos/docs';
import { definedOnly, TeamDocs } from '@/metadata/repos/teamDocs';
import { AlertSource } from '@/metadata/schemas/alert';
import { toDate } from '@/metadata/schemas/common';
import {
  type DashboardDoc,
  DashboardDocSchema,
  type DashboardInput,
  type DashboardPatch,
  type IDashboard,
} from '@/metadata/schemas/dashboard';
import { KEY_FIELD } from '@/metadata/types';
import { claimUnique, releaseUnique, resolveUnique } from '@/metadata/unique';

function toDashboard(id: Id, d: DashboardDoc): IDashboard {
  // Tiles and the other Mixed fields are validated by the API layer's Zod
  // schemas on write, as they were over Mongoose's Mixed type.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return {
    ...d,
    _id: id,
    id,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  } as IDashboard;
}

const PROVISIONED = 'dashboard_provisioned';

export type DashboardSearch = {
  /** Case-insensitive substring of the name. */
  query?: string;
  /** Every tag must be present. */
  tags?: readonly string[];
  limit?: number;
};

/** `dashboards/<id>`; provisioned dashboards are unique per (team, name). */
export class DashboardRepository extends TeamDocs<DashboardDoc, IDashboard> {
  constructor(deps: RepoDeps) {
    super(deps, 'dashboards', DashboardDocSchema, toDashboard);
  }

  create(team: Id, input: DashboardInput, userId?: Id): Promise<IDashboard> {
    return this.insertDoc(
      this.fresh({ ...input, team, createdBy: userId, updatedBy: userId }),
    );
  }

  /**
   * `$set` semantics. `createdBy`, `provisioned`, and `team` are immutable
   * here, so a spread of a stored document cannot move or re-label it.
   */
  async update(
    team: Id,
    id: Id,
    patch: DashboardPatch,
    userId?: Id,
  ): Promise<IDashboard | null> {
    const r = await this.mutate(team, id, cur => ({
      ...cur,
      ...definedOnly(patch),
      createdBy: cur.createdBy,
      provisioned: cur.provisioned,
      ...(userId ? { updatedBy: userId } : {}),
    }));
    return r ? toDashboard(r.id, r.after) : null;
  }

  /**
   * Replaces one tile, matched by its `id`, together with any metadata
   * `patch`, in one CAS write (the MCP patch tool's positional `tiles.$`
   * update). Null when the dashboard is gone or no longer has that tile, in
   * which case nothing is written.
   */
  async patchTile(
    team: Id,
    id: Id,
    tileId: string,
    tile: unknown,
    patch: DashboardPatch = {},
    userId?: Id,
  ): Promise<IDashboard | null> {
    const r = await this.mutate(team, id, cur => {
      const tiles = cur.tiles.map(t =>
        z.object({ id: z.unknown() }).safeParse(t).data?.id === tileId
          ? tile
          : t,
      );
      if (tiles.every((t, i) => t === cur.tiles[i])) return null;
      return {
        ...cur,
        ...definedOnly(patch),
        tiles,
        ...(userId ? { updatedBy: userId } : {}),
      };
    });
    return r && r.after !== r.before ? toDashboard(r.id, r.after) : null;
  }

  async delete(team: Id, rawId: Id): Promise<IDashboard | null> {
    return this.release(team, await super.delete(team, rawId));
  }

  /** Deletes the dashboard together with its tile alerts, atomically. */
  async deleteWithAlerts(team: Id, rawId: Id): Promise<IDashboard | null> {
    const id = this.idOf(rawId);
    const r = await this.deleteCascading(team, id, {
      dashboard: id ?? '',
      source: AlertSource.TILE,
    });
    return this.release(team, r && toDashboard(r.id, r.doc));
  }

  private async release(team: Id, removed: IDashboard | null) {
    if (removed?.provisioned) {
      await releaseUnique(
        this.kv,
        PROVISIONED,
        [team, removed.name],
        removed._id,
      );
    }
    return removed;
  }

  /** The team's dashboards ordered by name (Mongo `sort({ name })` parity). */
  listByName(
    team: Id,
    dir: 'asc' | 'desc',
    o: { limit?: number } = {},
  ): Promise<IDashboard[]> {
    return this.findSpec(team, {
      orderBy: [
        { field: 'name', dir },
        { field: KEY_FIELD, dir: 'asc' },
      ],
      ...o,
    });
  }

  /** MCP `cbt_search_dashboards`: name substring and/or all tags. */
  search(team: Id, s: DashboardSearch): Promise<IDashboard[]> {
    return this.findSpec(team, {
      ...(s.query ? { contains: { field: 'name', value: s.query } } : {}),
      ...(s.tags?.length ? { hasAll: { field: 'tags', values: s.tags } } : {}),
      orderBy: [{ field: KEY_FIELD, dir: 'asc' }],
      limit: s.limit,
    });
  }

  /** A user-created (not provisioned) dashboard with this name exists. */
  async hasUserNamed(team: Id, name: string): Promise<boolean> {
    const rows = await this.list(team, { name });
    return rows.some(d => !d.provisioned);
  }

  /**
   * The provisioner's upsert: finds the provisioned dashboard named `name`
   * and replaces its content, or creates it. Concurrent callers converge on
   * one document through the `dashboard_provisioned` lookup doc.
   */
  async upsertProvisioned(
    team: Id,
    name: string,
    content: DashboardPatch,
  ): Promise<{ dashboard: IDashboard; created: boolean }> {
    const parts = [team, name];
    for (let attempt = 0; attempt < 3; attempt++) {
      const owner = await resolveUnique(this.kv, PROVISIONED, parts);
      const updated = owner
        ? await this.mutate(team, owner, cur =>
            cur.provisioned && cur.name === name
              ? { ...cur, ...definedOnly(content), name }
              : null,
          )
        : null;
      if (updated && updated.after !== updated.before) {
        return {
          dashboard: toDashboard(updated.id, updated.after),
          created: false,
        };
      }
      const id = newId(this.now());
      try {
        await claimUnique(this.kv, PROVISIONED, parts, id, {
          now: this.now,
          // Stale when the dashboard is gone, renamed, or no longer provisioned.
          ownerExists: async o => {
            const d = await this.getRaw(team, o);
            return d != null && d.provisioned && d.name === name;
          },
        });
      } catch (err) {
        if (err instanceof DuplicateKeyError) continue;
        throw err;
      }
      const dashboard = await this.insertDoc(
        this.fresh({ ...content, name, team, provisioned: true }),
        id,
      );
      return { dashboard, created: true };
    }
    throw new DuplicateKeyError(PROVISIONED);
  }
}
