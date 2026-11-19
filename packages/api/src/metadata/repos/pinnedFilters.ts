import type { PinnedFiltersValue } from '@couchbase-traces/common-utils/dist/types';

import { DuplicateKeyError } from '@/metadata/errors';
import { type Id, isValidId, newId } from '@/metadata/ids';
import {
  getDoc,
  mutateDoc,
  parseRows,
  type RepoDeps,
} from '@/metadata/repos/docs';
import { iso, toDate } from '@/metadata/schemas/common';
import {
  type IPinnedFilter,
  type PinnedFilterDoc,
  PinnedFilterDocSchema,
} from '@/metadata/schemas/pinnedFilter';

function toPinnedFilter(d: PinnedFilterDoc): IPinnedFilter {
  return {
    ...d,
    _id: d.id,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  };
}

/** The key is the constraint: one document per team and source. */
const keyOf = (team: Id, source: Id) => `pin::${team}::${source.toLowerCase()}`;

/** `pinned_filters/pin::<team>::<source>`. */
export class PinnedFilterRepository {
  private readonly now: () => Date;

  constructor(private readonly deps: RepoDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private get kv() {
    return this.deps.kv;
  }

  async get(team: Id, source: Id): Promise<IPinnedFilter | null> {
    if (!isValidId(source)) return null;
    const doc = await getDoc(
      this.kv,
      PinnedFilterDocSchema,
      'pinned_filters',
      keyOf(team, source),
    );
    return doc ? toPinnedFilter(doc) : null;
  }

  async list(team: Id): Promise<IPinnedFilter[]> {
    const rows = await this.deps.find.find<unknown>('pinned_filters', {
      where: { team },
    });
    return parseRows(PinnedFilterDocSchema, 'pinned_filters', rows, (_key, d) =>
      toPinnedFilter(d),
    ).sort((a, b) => (a._id < b._id ? -1 : 1));
  }

  /** Upsert: the first write mints the wire id, later writes keep it. */
  async put(
    team: Id,
    source: Id,
    value: { fields: string[]; filters: PinnedFiltersValue },
  ): Promise<IPinnedFilter> {
    const key = keyOf(team, source);
    for (let attempt = 0; attempt < 3; attempt++) {
      const updated = await mutateDoc(
        this.kv,
        PinnedFilterDocSchema,
        'pinned_filters',
        key,
        cur => ({
          ...cur,
          fields: value.fields,
          filters: value.filters,
          updatedAt: iso(this.now()),
        }),
      );
      if (updated) return toPinnedFilter(updated.after);
      const at = iso(this.now());
      const doc = PinnedFilterDocSchema.parse({
        id: newId(this.now()),
        team,
        source: source.toLowerCase(),
        ...value,
        createdAt: at,
        updatedAt: at,
      });
      try {
        await this.kv.insert('pinned_filters', key, doc);
        return toPinnedFilter(doc);
      } catch (err) {
        // A concurrent first write won the key: update theirs.
        if (!(err instanceof DuplicateKeyError)) throw err;
      }
    }
    throw new DuplicateKeyError('pinned_filter');
  }

  async delete(team: Id, source: Id): Promise<boolean> {
    return this.kv.remove('pinned_filters', keyOf(team, source));
  }
}
