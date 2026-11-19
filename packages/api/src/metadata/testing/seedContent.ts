/**
 * Integration-test seeding for saved searches, dashboards, and webhooks: the
 * stand-ins for `SavedSearch.create`, `Dashboard.create`, `Webhook.create`,
 * and the `findById` / `updateOne` / raw-collection calls the ported tests
 * used. Written for the C3 move off Mongoose; ids may arrive as ObjectIds.
 */
import set from 'lodash/set';

import { getMetadataStore } from '@/metadata';
import { type Id, newId } from '@/metadata/ids';
import type { IDashboard } from '@/metadata/schemas/dashboard';
import type { IPresetDashboardFilter } from '@/metadata/schemas/presetDashboardFilter';
import type { ISavedSearch } from '@/metadata/schemas/savedSearch';
import type { IWebhook, WebhookInput } from '@/metadata/schemas/webhook';
import { loose } from '@/metadata/testing/loose';
import type { MetaCollection } from '@/metadata/types';

type IdLike = Id | { toString(): string } | null | undefined;
const idOf = (v: IdLike): Id => (v == null ? '' : v.toString().toLowerCase());

type Owned = { team: IdLike };
/** Loose on purpose: the ported tests pass shapes the old models coerced. */
type Loose<T> = { [K in keyof T]?: unknown };

async function teamOf(c: MetaCollection, id: IdLike): Promise<Id | null> {
  const raw = await getMetadataStore().kv.get<{ team: Id }>(c, idOf(id));
  return raw?.value.team ?? null;
}

/** Merges `patch` into the stored JSON, skipping repository rules. */
async function patchRaw(
  c: MetaCollection,
  id: IdLike,
  patch: Record<string, unknown>,
  unset: readonly string[] = [],
): Promise<void> {
  const kv = getMetadataStore().kv;
  const cur = await kv.get<Record<string, unknown>>(c, idOf(id));
  if (!cur) throw new Error(`${c}/${idOf(id)} not found`);
  const next = Object.fromEntries(
    Object.entries({ ...cur.value, ...patch }).filter(
      ([k]) => !unset.includes(k),
    ),
  );
  await kv.replace(c, idOf(id), next);
}

async function insertRaw(
  c: MetaCollection,
  doc: Record<string, unknown>,
): Promise<Id> {
  const at = new Date().toISOString();
  const id = idOf(loose<IdLike>(doc._id)) || newId();
  const { _id: _ignored, ...rest } = doc;
  await getMetadataStore().kv.insert(c, id, {
    createdAt: at,
    updatedAt: at,
    ...rest,
    team: idOf(loose<IdLike>(rest.team)),
  });
  return id;
}

async function teamsIds(team?: IdLike): Promise<Id[]> {
  if (team != null) return [idOf(team)];
  return (await getMetadataStore().teams.listAll()).map(t => t._id);
}

// -- webhooks ---------------------------------------------------------------

type WebhookSeed = Owned & Loose<WebhookInput> & { name: string };

/** `Webhook.create`. */
export async function seedWebhook(input: WebhookSeed): Promise<IWebhook> {
  const { team, ...rest } = input;
  return getMetadataStore().webhooks.create(
    idOf(team),
    loose<WebhookInput>(rest),
  );
}

/** `Webhook.findById`. */
export async function findWebhook(id: IdLike): Promise<IWebhook | null> {
  const team = await teamOf('webhooks', id);
  return team ? getMetadataStore().webhooks.get(team, idOf(id)) : null;
}

/** `Webhook.find({ team })`; no team lists every team's. */
export async function listWebhooks(team?: IdLike): Promise<IWebhook[]> {
  const store = getMetadataStore();
  return (
    await Promise.all((await teamsIds(team)).map(t => store.webhooks.list(t)))
  ).flat();
}

/** `Webhook.countDocuments`. */
export async function countWebhooks(team?: IdLike): Promise<number> {
  return (await listWebhooks(team)).length;
}

/** `Webhook.deleteOne({ _id })`. */
export async function removeWebhook(id: IdLike): Promise<void> {
  const team = await teamOf('webhooks', id);
  if (team) await getMetadataStore().webhooks.delete(team, idOf(id));
}

/** `Webhook.updateOne({ _id }, { $set })`, without the unique-name claim. */
export const patchWebhook = (id: IdLike, patch: Record<string, unknown>) =>
  patchRaw('webhooks', id, patch);

/** `Webhook.collection.insertOne`, for shapes the repository refuses. */
export const seedRawWebhook = (doc: Record<string, unknown> & Owned) =>
  insertRaw('webhooks', doc);

// -- dashboards -------------------------------------------------------------

type DashboardSeed = Owned &
  Loose<Omit<IDashboard, '_id' | 'id' | 'team'>> & { name: string };

/** `Dashboard.create`; `provisioned` and ownership are kept as given. */
export async function seedDashboard(input: DashboardSeed): Promise<IDashboard> {
  const { team, createdBy, updatedBy, provisioned, ...rest } = input;
  const store = getMetadataStore();
  const t = idOf(team);
  if (provisioned === true) {
    return (
      await store.dashboards.upsertProvisioned(
        t,
        input.name,
        loose<never>(rest),
      )
    ).dashboard;
  }
  return store.dashboards
    .create(
      t,
      loose<never>({ tiles: [], tags: [], ...rest }),
      createdBy == null ? undefined : idOf(loose<IdLike>(createdBy)),
    )
    .then(async d => {
      if (updatedBy != null) {
        await patchRaw('dashboards', d._id, {
          updatedBy: idOf(loose<IdLike>(updatedBy)),
        });
      }
      return (await findDashboard(d._id))!;
    });
}

/** `Dashboard.findById`. */
export async function findDashboard(id: IdLike): Promise<IDashboard | null> {
  const team = await teamOf('dashboards', id);
  return team ? getMetadataStore().dashboards.get(team, idOf(id)) : null;
}

/** `Dashboard.find({ team })`; no team lists every team's. */
export async function listDashboards(team?: IdLike): Promise<IDashboard[]> {
  const store = getMetadataStore();
  return (
    await Promise.all((await teamsIds(team)).map(t => store.dashboards.list(t)))
  ).flat();
}

/** `Dashboard.countDocuments`. */
export async function countDashboards(team?: IdLike): Promise<number> {
  return (await listDashboards(team)).length;
}

/** `Dashboard.deleteOne({ _id })`. */
export async function removeDashboard(id: IdLike): Promise<void> {
  const team = await teamOf('dashboards', id);
  if (team) await getMetadataStore().dashboards.delete(team, idOf(id));
}

/** `Dashboard.updateOne({ _id }, { $set })` / `findByIdAndUpdate`. */
export const patchDashboard = (
  id: IdLike,
  patch: Record<string, unknown>,
  unset: readonly string[] = [],
) => patchRaw('dashboards', id, patch, unset);

/** `Dashboard.updateOne({ _id }, { $set: { 'tiles.0.config.color': v } })`. */
export async function setDashboardPaths(
  id: IdLike,
  paths: Record<string, unknown>,
): Promise<void> {
  const kv = getMetadataStore().kv;
  const cur = await kv.get<Record<string, unknown>>('dashboards', idOf(id));
  if (!cur) throw new Error(`dashboards/${idOf(id)} not found`);
  const next = structuredClone(cur.value);
  for (const [path, value] of Object.entries(paths)) set(next, path, value);
  await kv.replace('dashboards', idOf(id), next);
}

/** `Dashboard.collection.insertOne`, for legacy shapes. */
export const seedRawDashboard = (doc: Record<string, unknown> & Owned) =>
  insertRaw('dashboards', doc);

// -- saved searches ---------------------------------------------------------

type SavedSearchSeed = Owned &
  Loose<Omit<ISavedSearch, '_id' | 'id' | 'team'>> & { source: IdLike };

/** `SavedSearch.create`. */
export async function seedSavedSearch(
  input: SavedSearchSeed,
): Promise<ISavedSearch> {
  const { team, source, createdBy, ...rest } = input;
  return getMetadataStore().savedSearches.create(
    idOf(team),
    loose<never>({ ...rest, source: idOf(source) }),
    createdBy == null ? undefined : idOf(loose<IdLike>(createdBy)),
  );
}

/** `SavedSearch.findById`. */
export async function findSavedSearch(
  id: IdLike,
): Promise<ISavedSearch | null> {
  const team = await teamOf('saved_searches', id);
  return team ? getMetadataStore().savedSearches.get(team, idOf(id)) : null;
}

/** `SavedSearch.deleteOne({ _id })`. */
export async function removeSavedSearch(id: IdLike): Promise<void> {
  const team = await teamOf('saved_searches', id);
  if (team) await getMetadataStore().savedSearches.delete(team, idOf(id));
}

/** `SavedSearch.updateOne({ _id }, { $set })`. */
export const patchSavedSearch = (id: IdLike, patch: Record<string, unknown>) =>
  patchRaw('saved_searches', id, patch);

// -- preset dashboard filters -------------------------------------------------

type PresetSeed = Owned &
  Loose<Omit<IPresetDashboardFilter, '_id' | 'id' | 'team' | 'source'>> & {
    source: IdLike;
  };

/** `PresetDashboardFilter.create`. */
export async function seedPresetFilter(
  input: PresetSeed,
): Promise<IPresetDashboardFilter> {
  const { team, source, ...rest } = input;
  return getMetadataStore().presetDashboardFilters.create(
    idOf(team),
    loose<never>({ ...rest, source: idOf(source) }),
  );
}

/** `PresetDashboardFilter.findById`. */
export async function findPresetFilter(
  id: IdLike,
): Promise<IPresetDashboardFilter | null> {
  const team = await teamOf('preset_dashboard_filters', id);
  return team
    ? getMetadataStore().presetDashboardFilters.get(team, idOf(id))
    : null;
}

/** `PresetDashboardFilter.find({ team })`. */
export const listPresetFilters = (team: IdLike) =>
  getMetadataStore().presetDashboardFilters.list(idOf(team));
