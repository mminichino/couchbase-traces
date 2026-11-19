import type { PinnedFiltersValue } from '@couchbase-traces/common-utils/dist/types';

import { getMetadataStore } from '@/metadata';

/**
 * Get team-level pinned filters for a team+source combination.
 */
export async function getPinnedFilters(
  teamId: string | { toString(): string },
  sourceId: string | { toString(): string },
) {
  return getMetadataStore().pinnedFilters.get(
    teamId.toString(),
    sourceId.toString(),
  );
}

/**
 * Upsert team-level pinned filters for a team+source.
 */
export async function updatePinnedFilters(
  teamId: string | { toString(): string },
  sourceId: string | { toString(): string },
  data: { fields: string[]; filters: PinnedFiltersValue },
) {
  return getMetadataStore().pinnedFilters.put(
    teamId.toString(),
    sourceId.toString(),
    data,
  );
}
