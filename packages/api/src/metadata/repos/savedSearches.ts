import type { Id } from '@/metadata/ids';
import { type RepoDeps } from '@/metadata/repos/docs';
import { definedOnly, TeamDocs } from '@/metadata/repos/teamDocs';
import { toDate } from '@/metadata/schemas/common';
import {
  type ISavedSearch,
  type SavedSearchDoc,
  SavedSearchDocSchema,
  type SavedSearchInput,
  type SavedSearchPatch,
} from '@/metadata/schemas/savedSearch';

function toSavedSearch(id: Id, d: SavedSearchDoc): ISavedSearch {
  // The doc is validated on read; the API layer owns the enum narrowing of
  // `whereLanguage` and `filters`, as it did over Mongoose.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return {
    ...d,
    _id: id,
    id,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  } as ISavedSearch;
}

/** `saved_searches/<id>`. */
export class SavedSearchRepository extends TeamDocs<
  SavedSearchDoc,
  ISavedSearch
> {
  constructor(deps: RepoDeps) {
    super(deps, 'saved_searches', SavedSearchDocSchema, toSavedSearch);
  }

  create(
    team: Id,
    input: SavedSearchInput,
    userId?: Id,
  ): Promise<ISavedSearch> {
    return this.insertDoc(
      this.fresh({
        ...input,
        team,
        createdBy: userId,
        updatedBy: userId,
      }),
    );
  }

  /**
   * `$set` semantics. `createdBy` is immutable: a caller that spreads a
   * stored document back in cannot rewrite ownership attribution.
   */
  async update(
    team: Id,
    id: Id,
    patch: SavedSearchPatch,
    userId?: Id,
  ): Promise<ISavedSearch | null> {
    const r = await this.mutate(team, id, cur => ({
      ...cur,
      ...definedOnly(patch),
      createdBy: cur.createdBy,
      ...(userId ? { updatedBy: userId } : {}),
    }));
    return r ? toSavedSearch(r.id, r.after) : null;
  }
}
