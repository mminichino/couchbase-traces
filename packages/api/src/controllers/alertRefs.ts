import { getMetadataStore } from '@/metadata';
import type { Id } from '@/metadata/ids';
import type { IAlert } from '@/metadata/schemas/alert';
import type { IDashboard } from '@/metadata/schemas/dashboard';
import type { ISavedSearch } from '@/metadata/schemas/savedSearch';

type RefPath = 'savedSearch' | 'dashboard';

/**
 * An alert whose `savedSearch` / `dashboard` refs are resolved to their
 * documents (null when the target is gone). A plain object: the metadata
 * store has no populate, so this joins the two reads.
 */
export type HydratedAlert = Omit<IAlert, RefPath> & {
  savedSearch?: ISavedSearch | null;
  dashboard?: IDashboard | null;
  /** The original ref id of a resolved ref, kept when its target is gone. */
  populated(path: RefPath): Id | undefined;
};

/**
 * One batched read per referenced collection, scoped to the team. A ref that
 * is unset stays unset; one whose target is missing becomes null.
 */
export async function hydrateAlertRefs(
  teamId: { toString(): string },
  alerts: IAlert[],
): Promise<HydratedAlert[]> {
  const store = getMetadataStore();
  const team = teamId.toString();
  const idsOf = (path: RefPath) => [
    ...new Set(alerts.flatMap(a => (a[path] == null ? [] : [a[path]]))),
  ];
  const [searches, dashboards] = await Promise.all([
    store.savedSearches.getMany(team, idsOf('savedSearch')),
    store.dashboards.getMany(team, idsOf('dashboard')),
  ]);

  return alerts.map(alert => {
    const { savedSearch: searchRef, dashboard: dashboardRef, ...rest } = alert;
    const out: HydratedAlert = { ...rest, populated: () => undefined };
    // Non-enumerable so spreading or serializing the alert never carries it.
    Object.defineProperty(out, 'populated', {
      enumerable: false,
      value: (path: RefPath) =>
        (path === 'savedSearch' ? searchRef : dashboardRef) ?? undefined,
    });
    if (searchRef != null) {
      out.savedSearch = searches.get(searchRef) ?? null;
    }
    if (dashboardRef != null) {
      out.dashboard = dashboards.get(dashboardRef) ?? null;
    }
    return out;
  });
}
