import type { Id } from '@/metadata/ids';
import type { RepoDeps } from '@/metadata/repos/docs';

export type CouchbaseTagKind = 'dashboard' | 'savedSearch' | 'alert';

const COLLECTION = {
  dashboard: 'dashboards',
  savedSearch: 'saved_searches',
  alert: 'alerts',
} as const;

/** Distinct tags across the dashboard, saved search, and alert collections. */
export class TagRepository {
  constructor(private readonly deps: RepoDeps) {}

  async distinct(
    team: Id,
    kinds: readonly CouchbaseTagKind[],
  ): Promise<string[]> {
    const lists = await Promise.all(
      kinds.map(kind =>
        this.deps.find.distinct(COLLECTION[kind], 'tags', { where: { team } }),
      ),
    );
    return [...new Set(lists.flat())];
  }
}
