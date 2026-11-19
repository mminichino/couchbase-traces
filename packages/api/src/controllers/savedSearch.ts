import {
  SavedSearchListApiResponse,
  SavedSearchSchema,
} from '@couchbase-traces/common-utils/dist/types';
import { groupBy } from 'lodash';
import { z } from 'zod';

import {
  applyUserDisplays,
  loadUserDisplays,
  type UserDisplays,
} from '@/controllers/userDisplay';
import { getMetadataStore } from '@/metadata';
import type { ISavedSearch } from '@/metadata/schemas/savedSearch';
import { resolveAlertDisplayFields } from '@/utils/alerts';

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
  const alerts = (await getMetadataStore().alerts.listEvery(teamId)).filter(
    a => a.savedSearch != null,
  );
  const users = await loadUserDisplays([
    ...savedSearches.flatMap(s => [s.createdBy, s.updatedBy]),
    ...alerts.map(a => a.createdBy),
  ]);

  const alertsBySavedSearchId = groupBy(alerts, 'savedSearch');

  return savedSearches.map(savedSearch => ({
    ...withUsers(users, savedSearch),
    // The wire shape carries dates as ISO strings (the JSON layer converts
    // the Date instants) and the creator as a display, which the id-typed
    // alert cannot express.
    alerts: alertsBySavedSearchId[savedSearch._id]?.map(alert => ({
      ...applyUserDisplays(users, alert, ['createdBy']),
      ...resolveAlertDisplayFields(alert, { savedSearch }),
    })) as unknown as SavedSearchListApiResponse['alerts'],
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
    // `source` is the string id.
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
  // One transaction removes the saved search and every alert that targets it,
  // so no alert is ever left pointing at a deleted search.
  return getMetadataStore().savedSearches.deleteWithAlerts(
    teamId,
    savedSearchId,
  );
}
