import {
  SavedSearchListApiResponse,
  SavedSearchSchema,
} from '@couchbase-traces/common-utils/dist/types';
import { groupBy } from 'lodash';
import { z } from 'zod';

import { deleteSavedSearchAlerts } from '@/controllers/alerts';
import {
  applyUserDisplays,
  loadUserDisplays,
  type UserDisplays,
} from '@/controllers/userDisplay';
import { getMetadataStore } from '@/metadata';
import type { ISavedSearch } from '@/metadata/schemas/savedSearch';
import Alert from '@/models/alert';
import { resolveAlertDisplayFields } from '@/utils/alerts';
import logger from '@/utils/logger';

type SavedSearchWithoutId = Omit<z.infer<typeof SavedSearchSchema>, 'id'>;

type ListRow = Omit<SavedSearchListApiResponse, 'alerts'>;

/** The row as the wire carries it: dates as ISO strings, users as displays. */
function withUsers(users: UserDisplays, s: ISavedSearch): ListRow {
  const row = {
    ...s,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
  // applyUserDisplays swaps the user ids for displays, which the declared row
  // type (ids) cannot express, so the result is re-typed to the wire shape.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return applyUserDisplays(users, row, [
    'createdBy',
    'updatedBy',
  ]) as unknown as ListRow;
}

export async function getSavedSearches(
  teamId: string,
): Promise<SavedSearchListApiResponse[]> {
  const savedSearches = await getMetadataStore().savedSearches.list(teamId);
  const alerts = await Alert.find(
    { team: teamId, savedSearch: { $exists: true, $ne: null } },
    { __v: 0 },
  );
  const users = await loadUserDisplays([
    ...savedSearches.flatMap(s => [s.createdBy, s.updatedBy]),
    ...alerts.map(a => a.createdBy),
  ]);

  const alertsBySavedSearchId = groupBy(alerts, 'savedSearch');

  return savedSearches.map(savedSearch => ({
    ...withUsers(users, savedSearch),
    alerts: alertsBySavedSearchId[savedSearch._id.toString()]?.map(alert => ({
      ...applyUserDisplays(users, alert.toJSON(), ['createdBy']),
      ...resolveAlertDisplayFields(alert, { savedSearch }),
    })),
  }));
}

export function getSavedSearch(teamId: string, savedSearchId: string) {
  // No user display: callers read the doc or its external JSON, neither of
  // which renders the creator.
  return getMetadataStore().savedSearches.get(teamId, savedSearchId);
}

export function createSavedSearch(
  teamId: string,
  savedSearch: SavedSearchWithoutId,
  userId?: string,
) {
  return getMetadataStore().savedSearches.create(
    teamId,
    // `source` was an ObjectId in Mongo; it is the string id now.
    { ...savedSearch, source: savedSearch.source.toString() },
    userId,
  );
}

export function updateSavedSearch(
  teamId: string,
  savedSearchId: string,
  savedSearch: SavedSearchWithoutId,
  userId?: string,
) {
  // The repository keeps `createdBy` and `team` fixed, so a caller that
  // spreads a merged stored document cannot rewrite ownership attribution.
  return getMetadataStore().savedSearches.update(
    teamId,
    savedSearchId,
    savedSearch,
    userId,
  );
}

export async function deleteSavedSearch(teamId: string, savedSearchId: string) {
  const store = getMetadataStore();
  const savedSearch = await store.savedSearches.get(teamId, savedSearchId);
  if (savedSearch == null) {
    return null;
  }
  // Delete dependent alerts before the parent. Without a transaction (which
  // requires a replica set), the deletes are not atomic, so this order picks
  // the least-bad partial-failure mode: if deleteSavedSearchAlerts throws,
  // nothing is deleted and the caller can retry. If the final deleteOne throws
  // after the alerts are gone, the search survives without its alerts —
  // recoverable by re-creating alerts, and strictly better than the reverse
  // order's failure mode (orphaned alerts pointing at a deleted saved search).
  await deleteSavedSearchAlerts(savedSearchId, teamId);
  await store.savedSearches.delete(teamId, savedSearchId);
  // Re-sweep after the parent is gone: a concurrent alert-create targeting this
  // saved search could land between the two deletes above and orphan itself.
  // Once the parent no longer exists this second sweep cleans up any such alert
  // (and is a cheap no-op in the common case). Best-effort: the parent is
  // already deleted, so the operation has succeeded from the caller's view — a
  // failure here must not surface as a 500. Log it so the (rare) orphan window
  // is observable and can be swept later, and still return success.
  try {
    await deleteSavedSearchAlerts(savedSearchId, teamId);
  } catch (e) {
    logger.warn(
      { err: e, savedSearchId, team: teamId },
      'Post-delete alert re-sweep failed; a concurrently-created alert may be orphaned for this deleted saved search',
    );
  }
  return savedSearch;
}
