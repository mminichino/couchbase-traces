/**
 * Integration-test fixtures for alerts and alert history. Each function is a
 * thin wrapper over the metadata store; seeds and patches write raw
 * documents (no repository rules) so tests can build legacy-shaped data.
 */
import set from 'lodash/set';
import unset from 'lodash/unset';

import { hydrateAlertRefs } from '@/controllers/alertRefs';
import { getMetadataStore } from '@/metadata';
import { type Id, newId } from '@/metadata/ids';
import type { IAlert } from '@/metadata/schemas/alert';
import type { IAlertHistory } from '@/metadata/schemas/alertHistory';
import { loose } from '@/metadata/testing/loose';

type Doc = Record<string, unknown>;
type IdLike = Id | { toString(): string };
export type HistoryRow = IAlertHistory & { _id: Id };

/** Dates become ISO strings and `undefined` fields drop: the stored shape. */
function stored(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(stored);
  if (v != null && typeof v === 'object') {
    return Object.fromEntries(
      Object.entries(v)
        .filter(([, x]) => x !== undefined)
        .map(([k, x]) => [k, stored(x)]),
    );
  }
  return v;
}

/**
 * Sets each key (dotted paths allowed) and removes the ones whose value is
 * `undefined`.
 */
function applyPatch(doc: Doc, patch: Doc): Doc {
  const next: Doc = structuredClone(doc);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) unset(next, k);
    else set(next, k, stored(v));
  }
  return next;
}

// -- alerts -----------------------------------------------------------------

/** A raw write of the document as given; only the timestamps are filled. */
export async function seedAlertRaw(doc: Doc): Promise<Id> {
  const { _id, ...rest } = loose<Doc>(stored(doc));
  const id = _id != null ? String(_id) : newId();
  const at = new Date().toISOString();
  await getMetadataStore().kv.insert('alerts', id, {
    createdAt: at,
    updatedAt: at,
    ...rest,
  });
  return id;
}

/** As `seedAlertRaw`, with the schema defaults for state and source. */
export async function seedAlert(fields: Doc): Promise<IAlert> {
  const id = await seedAlertRaw({
    state: 'OK',
    source: 'saved_search',
    ...fields,
  });
  const made = await getAlert(id);
  if (!made) throw new Error(`alert ${id} was not stored`);
  return made;
}

export async function getAlert(id: IdLike): Promise<IAlert | null> {
  const key = id.toString();
  const store = getMetadataStore();
  const raw = await store.kv.get<{ team: string }>('alerts', key);
  return raw ? store.alerts.get(raw.value.team, key) : null;
}

/** The alert with `savedSearch` and `dashboard` resolved to their documents. */
export async function getAlertHydrated(id: IdLike) {
  const alert = await getAlert(id);
  if (!alert) return null;
  const [hydrated] = await hydrateAlertRefs(alert.team, [alert]);
  return hydrated;
}

export async function listAlerts(
  where: (a: IAlert) => boolean = () => true,
): Promise<IAlert[]> {
  return (await getMetadataStore().alerts.listAll()).filter(where);
}

/** Patches the alerts in place; see `applyPatch` for the patch rules. */
export async function patchAlerts(
  target: IdLike | IdLike[],
  patch: Doc,
): Promise<void> {
  const kv = getMetadataStore().kv;
  for (const id of [target].flat().map(String)) {
    const cur = await kv.get<Doc>('alerts', id);
    if (!cur) throw new Error(`alerts/${id} not found`);
    await kv.replace('alerts', id, applyPatch(cur.value, patch));
  }
}

export async function removeAlert(id: IdLike): Promise<void> {
  await getMetadataStore().kv.remove('alerts', id.toString());
}

// -- alert history ----------------------------------------------------------

/** Writes rows through the repository (`counts` and `lastValues` default). */
export async function seedHistory(rows: Doc | Doc[]): Promise<void> {
  const results = await getMetadataStore().alertHistory.createMany(
    [rows].flat().map(r =>
      loose<IAlertHistory>({
        counts: 0,
        lastValues: [],
        ...r,
        alert: String(r.alert),
      }),
    ),
  );
  const failed = results.find(r => r.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
}

/** Every stored row of the alert, ERROR rows included, oldest first. */
export async function listHistory(
  alert: IdLike,
  where: (r: HistoryRow) => boolean = () => true,
): Promise<HistoryRow[]> {
  const rows = await getMetadataStore().alertHistory.rows(alert.toString());
  return rows.filter(where);
}

export async function countHistory(
  alert: IdLike,
  where?: (r: HistoryRow) => boolean,
): Promise<number> {
  return (await listHistory(alert, where)).length;
}

/** Patches every row of the alert, keeping each row's expiry. */
export async function patchHistory(alert: IdLike, patch: Doc): Promise<void> {
  const kv = getMetadataStore().kv;
  for (const r of await listHistory(alert)) {
    const cur = await kv.get<Doc>('alert_history', r._id);
    if (cur) {
      await kv.replace('alert_history', r._id, applyPatch(cur.value, patch), {
        preserveExpiry: true,
      });
    }
  }
}
