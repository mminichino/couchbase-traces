import {
  PresetDashboard,
  WebhookService,
} from '@couchbase-traces/common-utils/dist/types';

import { DuplicateKeyError } from '@/metadata/errors';
import { newId } from '@/metadata/ids';
import { loose } from '@/metadata/testing/loose';
import type { MetadataStore } from '@/metadata/types';

/**
 * Behavior the saved search, dashboard, webhook, favorite, pinned filter,
 * preset filter, and tag repositories share on both backends (plan §2, C3).
 * Each case uses fresh ids, so runs against a shared bucket never collide.
 */
export function describeContentRepos(
  backend: string,
  setup: () => Promise<MetadataStore>,
): void {
  describe(`content repositories: ${backend}`, () => {
    let store: MetadataStore;
    beforeAll(async () => {
      store = await setup();
    });

    // Tiles are opaque to the repositories; the cast stands in for a valid chart.
    const tileBody = (id: string) => ({
      id,
      x: 0,
      y: 0,
      w: 4,
      h: 2,
      config: {},
    });
    const tile = (id: string) => loose<never>(tileBody(id));

    describe('saved searches', () => {
      it('stores a string source id and isolates teams', async () => {
        const team = newId();
        const source = newId();
        const made = await store.savedSearches.create(team, {
          name: 'Errors',
          source,
          tags: ['prod'],
        });
        expect(made.source).toBe(source);
        expect(typeof made.source).toBe('string');
        expect(await store.savedSearches.get(newId(), made._id)).toBeNull();
        const got = await store.savedSearches.get(team, made._id);
        expect(got?.name).toBe('Errors');
        expect(got?.filters).toEqual([]);
      });

      it('updates with $set semantics and keeps createdBy', async () => {
        const team = newId();
        const author = newId();
        const editor = newId();
        const made = await store.savedSearches.create(
          team,
          { name: 'A', select: 'Body', source: newId() },
          author,
        );
        const next = await store.savedSearches.update(
          team,
          made._id,
          { name: 'B' },
          editor,
        );
        expect(next).toMatchObject({
          name: 'B',
          select: 'Body',
          createdBy: author,
          updatedBy: editor,
        });
      });

      it('deletes and reports absence', async () => {
        const team = newId();
        const made = await store.savedSearches.create(team, {
          name: 'A',
          source: newId(),
        });
        expect(await store.savedSearches.delete(team, made._id)).not.toBeNull();
        expect(await store.savedSearches.delete(team, made._id)).toBeNull();
      });
    });

    describe('dashboards', () => {
      it('creates with array defaults and lists by name', async () => {
        const team = newId();
        await store.dashboards.create(team, { name: 'b', tiles: [], tags: [] });
        await store.dashboards.create(team, { name: 'a', tiles: [], tags: [] });
        const asc = await store.dashboards.listByName(team, 'asc');
        expect(asc.map(d => d.name)).toEqual(['a', 'b']);
        expect(asc[0].containers).toEqual([]);
        expect(asc[0].provisioned).toBe(false);
        const desc = await store.dashboards.listByName(team, 'desc', {
          limit: 1,
        });
        expect(desc.map(d => d.name)).toEqual(['b']);
      });

      it('searches by name substring and by every tag', async () => {
        const team = newId();
        await store.dashboards.create(team, {
          name: 'Checkout latency',
          tiles: [],
          tags: ['prod', 'web'],
        });
        await store.dashboards.create(team, {
          name: 'Billing',
          tiles: [],
          tags: ['prod'],
        });
        const byName = await store.dashboards.search(team, { query: 'LATEN' });
        expect(byName.map(d => d.name)).toEqual(['Checkout latency']);
        const byTags = await store.dashboards.search(team, {
          tags: ['prod', 'web'],
        });
        expect(byTags.map(d => d.name)).toEqual(['Checkout latency']);
        expect(
          await store.dashboards.search(team, { tags: ['prod'] }),
        ).toHaveLength(2);
      });

      it('patches one tile atomically with metadata', async () => {
        const team = newId();
        const made = await store.dashboards.create(team, {
          name: 'D',
          tiles: [tile('t1'), tile('t2')],
          tags: [],
        });
        const next = await store.dashboards.patchTile(
          team,
          made._id,
          't2',
          { ...tileBody('t2'), w: 9 },
          { name: 'D2' },
        );
        expect(next?.name).toBe('D2');
        expect(loose<{ w: number }>(next?.tiles[1]).w).toBe(9);
        expect(loose<{ w: number }>(next?.tiles[0]).w).toBe(4);
        expect(
          await store.dashboards.patchTile(team, made._id, 'nope', tile('x')),
        ).toBeNull();
      });

      it('upserts provisioned dashboards once per (team, name)', async () => {
        const team = newId();
        const first = await store.dashboards.upsertProvisioned(team, 'P', {
          tiles: [tile('a')],
        });
        expect(first.created).toBe(true);
        expect(first.dashboard.provisioned).toBe(true);
        const [again, concurrent] = await Promise.all([
          store.dashboards.upsertProvisioned(team, 'P', { tiles: [tile('b')] }),
          store.dashboards.upsertProvisioned(team, 'P', { tiles: [tile('c')] }),
        ]);
        expect(again.created || concurrent.created).toBe(false);
        expect(again.dashboard._id).toBe(first.dashboard._id);
        expect(await store.dashboards.listByName(team, 'asc')).toHaveLength(1);
        expect(await store.dashboards.hasUserNamed(team, 'P')).toBe(false);
        await store.dashboards.create(team, { name: 'P', tiles: [], tags: [] });
        expect(await store.dashboards.hasUserNamed(team, 'P')).toBe(true);
      });

      it('frees the provisioned name when the dashboard is deleted', async () => {
        const team = newId();
        const first = await store.dashboards.upsertProvisioned(team, 'P', {
          tiles: [],
        });
        await store.dashboards.delete(team, first.dashboard._id);
        const again = await store.dashboards.upsertProvisioned(team, 'P', {
          tiles: [],
        });
        expect(again.created).toBe(true);
        expect(again.dashboard._id).not.toBe(first.dashboard._id);
      });
    });

    describe('webhooks', () => {
      const hook = (name: string, service = WebhookService.Slack) => ({
        name,
        service,
        url: 'https://example.com/hook',
      });

      it('enforces (team, service, name) uniqueness', async () => {
        const team = newId();
        await store.webhooks.create(team, hook('ops'));
        await expect(
          store.webhooks.create(team, hook('ops')),
        ).rejects.toBeInstanceOf(DuplicateKeyError);
        await store.webhooks.create(team, hook('ops', WebhookService.Generic));
        await store.webhooks.create(newId(), hook('ops'));
      });

      it('lists by service and finds by name', async () => {
        const team = newId();
        const slack = await store.webhooks.create(team, hook('a'));
        await store.webhooks.create(team, hook('b', WebhookService.Generic));
        const slackOnly = await store.webhooks.listByService(
          team,
          WebhookService.Slack,
        );
        expect(slackOnly.map(w => w._id)).toEqual([slack._id]);
        const both = await store.webhooks.listByService(team, [
          WebhookService.Slack,
          WebhookService.Generic,
        ]);
        expect(both).toHaveLength(2);
        expect(
          (await store.webhooks.findByName(team, WebhookService.Slack, 'a'))
            ?._id,
        ).toBe(slack._id);
        expect(
          await store.webhooks.findByName(team, WebhookService.Slack, 'zzz'),
        ).toBeNull();
      });

      it('renames atomically, freeing the old name and refusing a taken one', async () => {
        const team = newId();
        const a = await store.webhooks.create(team, hook('a'));
        await store.webhooks.create(team, hook('b'));
        await expect(
          store.webhooks.update(team, a._id, { set: { name: 'b' } }),
        ).rejects.toBeInstanceOf(DuplicateKeyError);
        const ok = await store.webhooks.update(team, a._id, {
          set: { name: 'c' },
        });
        expect(ok.status).toBe('ok');
        await store.webhooks.create(team, hook('a'));
      });

      it('unsets fields and guards on the destination', async () => {
        const team = newId();
        const made = await store.webhooks.create(team, {
          ...hook('a'),
          description: 'd',
        });
        const stale = await store.webhooks.update(team, made._id, {
          set: { description: 'x' },
          ifDestination: {
            url: 'https://other.example.com',
            service: made.service,
          },
        });
        expect(stale.status).toBe('conflict');
        const cleared = await store.webhooks.update(team, made._id, {
          unset: ['description'],
        });
        expect(
          cleared.status === 'ok' && cleared.webhook.description,
        ).toBeUndefined();
        expect(
          (await store.webhooks.update(team, newId(), { set: { name: 'x' } }))
            .status,
        ).toBe('not_found');
      });

      it('frees the name on delete', async () => {
        const team = newId();
        const made = await store.webhooks.create(team, hook('a'));
        await store.webhooks.delete(team, made._id);
        await store.webhooks.create(team, hook('a'));
      });
    });

    describe('favorites', () => {
      it('adds idempotently and removes', async () => {
        const team = newId();
        const user = newId();
        const resource = newId();
        const first = await store.favorites.add(
          team,
          user,
          'dashboard',
          resource,
        );
        const second = await store.favorites.add(
          team,
          user,
          'dashboard',
          resource,
        );
        expect(second._id).toBe(first._id);
        await store.favorites.add(team, user, 'savedSearch', resource);
        expect(await store.favorites.listForUser(team, user)).toHaveLength(2);
        expect(await store.favorites.listForUser(team, newId())).toHaveLength(
          0,
        );
        expect(
          await store.favorites.remove(team, user, 'dashboard', resource),
        ).toBe(true);
        expect(
          await store.favorites.remove(team, user, 'dashboard', resource),
        ).toBe(false);
        expect(await store.favorites.listForUser(team, user)).toHaveLength(1);
      });
    });

    describe('pinned filters', () => {
      it('upserts per (team, source), keeping the wire id', async () => {
        const team = newId();
        const source = newId();
        expect(await store.pinnedFilters.get(team, source)).toBeNull();
        const one = await store.pinnedFilters.put(team, source, {
          fields: ['a'],
          filters: { a: ['x'] },
        });
        const two = await store.pinnedFilters.put(team, source, {
          fields: ['a', 'b'],
          filters: { a: ['x', true] },
        });
        expect(two.id).toBe(one.id);
        expect(two.fields).toEqual(['a', 'b']);
        expect((await store.pinnedFilters.get(team, source))?.source).toBe(
          source,
        );
        expect(await store.pinnedFilters.list(team)).toHaveLength(1);
        expect(await store.pinnedFilters.delete(team, source)).toBe(true);
        expect(await store.pinnedFilters.delete(team, source)).toBe(false);
      });
    });

    describe('preset dashboard filters', () => {
      const input = (source: string) => ({
        name: 'Service',
        type: 'QUERY_EXPRESSION' as const,
        expression: 'service.name',
        presetDashboard: PresetDashboard.Services,
        source,
      });

      it('lists for a source, updates, and deletes within the preset', async () => {
        const team = newId();
        const source = newId();
        const made = await store.presetDashboardFilters.create(
          team,
          input(source),
        );
        expect(
          await store.presetDashboardFilters.listFor(
            team,
            source,
            PresetDashboard.Services,
          ),
        ).toHaveLength(1);
        expect(
          await store.presetDashboardFilters.listFor(
            team,
            newId(),
            PresetDashboard.Services,
          ),
        ).toHaveLength(0);
        const next = await store.presetDashboardFilters.update(team, made._id, {
          ...input(source),
          name: 'Renamed',
        });
        expect(next?.name).toBe('Renamed');
        expect(
          await store.presetDashboardFilters.deleteFor(
            team,
            loose<PresetDashboard>('other'),
            made._id,
          ),
        ).toBeNull();
        expect(
          await store.presetDashboardFilters.deleteFor(
            team,
            PresetDashboard.Services,
            made._id,
          ),
        ).not.toBeNull();
      });
    });

    describe('tags', () => {
      it('unions distinct tags across the requested kinds, per team', async () => {
        const team = newId();
        await store.dashboards.create(team, {
          name: 'd',
          tiles: [],
          tags: ['a', 'shared'],
        });
        await store.savedSearches.create(team, {
          name: 's',
          source: newId(),
          tags: ['b', 'shared'],
        });
        await store.dashboards.create(newId(), {
          name: 'other',
          tiles: [],
          tags: ['leak'],
        });
        const all = await store.tags.distinct(team, [
          'dashboard',
          'savedSearch',
        ]);
        expect([...all].sort()).toEqual(['a', 'b', 'shared']);
        expect(await store.tags.distinct(team, ['dashboard'])).toEqual(
          expect.arrayContaining(['a', 'shared']),
        );
        expect(await store.tags.distinct(team, [])).toEqual([]);
      });
    });
  });
}
