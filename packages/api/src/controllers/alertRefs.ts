import { getMetadataStore } from '@/metadata';
import type { IDashboard } from '@/metadata/schemas/dashboard';
import type { ISavedSearch } from '@/metadata/schemas/savedSearch';
import type { ObjectId } from '@/models';
import type { AlertDocument, IAlert } from '@/models/alert';

type RefPath = 'savedSearch' | 'dashboard';

/**
 * An alert whose `savedSearch` / `dashboard` refs are resolved to their
 * documents (null when the target is gone), as `populate` left them. Saved
 * searches and dashboards live in the metadata store, so Mongoose cannot
 * populate them; this is a plain object, not a Mongoose document.
 */
export type HydratedAlert = Omit<IAlert, RefPath> & {
  _id: ObjectId;
  savedSearch?: ISavedSearch | null;
  dashboard?: IDashboard | null;
  /** The original ref id of a resolved ref (Mongoose `populated()` parity). */
  populated(path: RefPath): ObjectId | undefined;
};

/**
 * One batched read per referenced collection, scoped to the team. A ref that
 * is unset stays unset; one whose target is missing becomes null.
 */
export async function hydrateAlertRefs(
  teamId: { toString(): string },
  alerts: AlertDocument[],
): Promise<HydratedAlert[]> {
  const store = getMetadataStore();
  const team = teamId.toString();
  const idsOf = (path: RefPath) => [
    ...new Set(alerts.flatMap(a => (a[path] == null ? [] : [`${a[path]}`]))),
  ];
  const [searches, dashboards] = await Promise.all([
    store.savedSearches.getMany(team, idsOf('savedSearch')),
    store.dashboards.getMany(team, idsOf('dashboard')),
  ]);

  return alerts.map(alert => {
    const plain = alert.toObject({ flattenMaps: false });
    const { savedSearch: searchRef, dashboard: dashboardRef, ...rest } = plain;
    const out: HydratedAlert = {
      ...rest,
      populated: () => undefined,
    };
    // Non-enumerable so spreading or serializing the alert never carries it.
    Object.defineProperty(out, 'populated', {
      enumerable: false,
      value: (path: RefPath) =>
        (path === 'savedSearch' ? searchRef : dashboardRef) ?? undefined,
    });
    if (searchRef != null) {
      out.savedSearch = searches.get(`${searchRef}`) ?? null;
    }
    if (dashboardRef != null) {
      out.dashboard = dashboards.get(`${dashboardRef}`) ?? null;
    }
    return out;
  });
}
