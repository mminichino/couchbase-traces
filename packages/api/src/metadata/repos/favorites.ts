import { DuplicateKeyError } from '@/metadata/errors';
import { type Id, newId } from '@/metadata/ids';
import { type RepoDeps } from '@/metadata/repos/docs';
import { TeamDocs } from '@/metadata/repos/teamDocs';
import { toDate } from '@/metadata/schemas/common';
import {
  type FavoriteDoc,
  FavoriteDocSchema,
  type FavoriteType,
  type IFavorite,
} from '@/metadata/schemas/favorite';
import { claimUnique, releaseUnique, resolveUnique } from '@/metadata/unique';

function toFavorite(id: Id, d: FavoriteDoc): IFavorite {
  return {
    ...d,
    _id: id,
    id,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  };
}

/** `favorites/<id>`, one per (team, user, resourceType, resourceId). */
export class FavoriteRepository extends TeamDocs<FavoriteDoc, IFavorite> {
  constructor(deps: RepoDeps) {
    super(deps, 'favorites', FavoriteDocSchema, toFavorite);
  }

  private parts(f: Omit<FavoriteDoc, 'createdAt' | 'updatedAt'>) {
    return [f.team, f.user, f.resourceType, f.resourceId];
  }

  /** The user's favorites, oldest first. */
  listForUser(team: Id, user: Id): Promise<IFavorite[]> {
    return this.list(team, { user });
  }

  /** Idempotent: adding an existing favorite returns it (and touches it). */
  async add(
    team: Id,
    user: Id,
    resourceType: FavoriteType,
    resourceId: string,
  ): Promise<IFavorite> {
    const key = { team, user, resourceType, resourceId };
    for (let attempt = 0; attempt < 3; attempt++) {
      const ownerId = await resolveUnique(this.kv, 'favorite', this.parts(key));
      if (ownerId) {
        const touched = await this.mutate(team, ownerId, cur => cur);
        if (touched) return toFavorite(touched.id, touched.after);
      }
      const id = newId(this.now());
      try {
        await claimUnique(this.kv, 'favorite', this.parts(key), id, {
          now: this.now,
          // A claim whose favorite is gone (crash, or removed meanwhile).
          ownerExists: async owner => this.exists(team, owner),
        });
      } catch (err) {
        if (err instanceof DuplicateKeyError) continue;
        throw err;
      }
      return this.insertDoc(this.fresh(key), id);
    }
    throw new DuplicateKeyError('favorite');
  }

  /** True when a favorite was removed. */
  async remove(
    team: Id,
    user: Id,
    resourceType: FavoriteType,
    resourceId: string,
  ): Promise<boolean> {
    const parts = this.parts({ team, user, resourceType, resourceId });
    const ownerId = await resolveUnique(this.kv, 'favorite', parts);
    if (!ownerId) return false;
    const removed = await this.delete(team, ownerId);
    await releaseUnique(this.kv, 'favorite', parts, ownerId);
    return removed != null;
  }
}
