import {
  AlertErrorType,
  AlertThresholdType,
} from '@couchbase-traces/common-utils/dist/types';

import { ValidationError } from '@/metadata/errors';
import { newId } from '@/metadata/ids';
import {
  type AlertFields,
  AlertSource,
  AlertState,
  type IAlertError,
} from '@/metadata/schemas/alert';
import type { IAlertHistory } from '@/metadata/schemas/alertHistory';
import { loose } from '@/metadata/testing/loose';
import type { MetadataStore } from '@/metadata/types';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
const T0 = Date.parse('2026-11-01T00:00:00.000Z');
const at = (n: number) => new Date(T0 + n * MINUTE);

const queryError = (timestamp: Date, message: string): IAlertError => ({
  timestamp,
  type: AlertErrorType.QUERY_ERROR,
  message,
});

const base: AlertFields = {
  channel: { type: 'webhook', webhookId: 'w1' },
  interval: '5m',
  threshold: 10,
  thresholdType: AlertThresholdType.ABOVE,
  source: AlertSource.SAVED_SEARCH,
};

function row(alert: string, n: number, o: Partial<IAlertHistory> = {}) {
  return {
    alert,
    counts: 1,
    createdAt: at(n),
    state: AlertState.OK,
    lastValues: [{ startTime: at(n - 5), count: 1 }],
    ...o,
  } satisfies IAlertHistory;
}

/**
 * Behavior the alert and alert history repositories share on both backends
 * (plan §2, C4): keyset paging, grouping and window queries, expiry, and the
 * transactional deletes. Each case uses fresh ids, so runs against a shared
 * bucket never collide.
 */
export function describeAlertRepos(
  backend: string,
  setup: () => Promise<MetadataStore>,
): void {
  describe(`alert repositories: ${backend}`, () => {
    let store: MetadataStore;
    beforeAll(async () => {
      store = await setup();
    });

    describe('alerts', () => {
      it('stores string refs, applies defaults, and isolates teams', async () => {
        const team = newId();
        const savedSearch = newId();
        const made = await store.alerts.create(team, { ...base, savedSearch });
        expect(made.savedSearch).toBe(savedSearch);
        expect(made.state).toBe(AlertState.OK);
        expect(await store.alerts.get(newId(), made._id)).toBeNull();
        expect((await store.alerts.get(team, made._id))?.threshold).toBe(10);
      });

      it('refuses fields the schema rules reject', async () => {
        await expect(
          store.alerts.create(newId(), {
            ...base,
            interval: '5m',
            scheduleOffsetMinutes: 5,
          }),
        ).rejects.toBeInstanceOf(ValidationError);
      });

      it('updates with $set semantics and can drop thresholdMax', async () => {
        const team = newId();
        const made = await store.alerts.create(team, {
          ...base,
          thresholdType: AlertThresholdType.BETWEEN,
          thresholdMax: 20,
          name: 'keep',
        });
        const next = await store.alerts.update(team, made._id, {
          threshold: 3,
          name: undefined,
        });
        expect(next).toMatchObject({ threshold: 3, name: 'keep' });
        expect(next?.thresholdMax).toBe(20);
        const cleared = await store.alerts.update(
          team,
          made._id,
          { thresholdType: AlertThresholdType.ABOVE },
          { clearThresholdMax: true },
        );
        expect(cleared?.thresholdMax).toBeUndefined();
        expect(await store.alerts.update(newId(), made._id, base)).toBeNull();
      });

      it('upserts a tile alert once per (dashboard, tile)', async () => {
        const team = newId();
        const ref = { dashboard: newId(), tileId: 't1' };
        const tile = { ...base, source: AlertSource.TILE, ...ref };
        const first = await store.alerts.upsertTile(team, ref, tile, {
          userId: 'a'.repeat(24),
        });
        const again = await store.alerts.upsertTile(
          team,
          ref,
          { ...tile, threshold: 99 },
          { userId: 'b'.repeat(24) },
        );
        expect(again._id).toBe(first._id);
        expect(again.threshold).toBe(99);
        expect(again.createdBy).toBe('a'.repeat(24));
        expect(await store.alerts.findTileAlerts(team)).toHaveLength(1);
      });

      it('setState touches only state and errors, and bumps updatedAt', async () => {
        const team = newId();
        const made = await store.alerts.create(team, base);
        await store.alerts.update(team, made._id, { name: 'edited' });
        await store.alerts.setState(made._id, AlertState.ALERT, []);
        const got = await store.alerts.get(team, made._id);
        expect(got).toMatchObject({ state: AlertState.ALERT, name: 'edited' });
        expect(got!.updatedAt.getTime()).toBeGreaterThanOrEqual(
          made.updatedAt.getTime(),
        );
      });

      it('lists tags of alerts with the other collections', async () => {
        const team = newId();
        await store.alerts.create(team, { ...base, tags: ['b', 'a'] });
        await store.alerts.create(team, { ...base, tags: ['a', 'c'] });
        expect((await store.tags.distinct(team, ['alert'])).sort()).toEqual([
          'a',
          'b',
          'c',
        ]);
      });
    });

    describe('alerts page', () => {
      it('pages by (displayName, id) with the null block first', async () => {
        const team = newId();
        const names = [null, 'beta', null, 'alpha', 'beta'];
        for (const displayName of names) {
          await store.alerts.create(team, { ...base, displayName });
        }
        const seen: (string | null)[] = [];
        let after: { name: string | null; id: string } | undefined;
        for (let guard = 0; guard < 10; guard++) {
          const page = await store.alerts.page(team, {}, { after, limit: 2 });
          seen.push(...page.items.map(a => a.displayName ?? null));
          const last = page.items.at(-1);
          if (!page.hasMore || !last) break;
          after = { name: last.displayName ?? null, id: last._id };
        }
        expect(seen).toEqual([null, null, 'alpha', 'beta', 'beta']);
        expect(await store.alerts.countPage(team, {})).toBe(5);
      });

      it('filters by tag, state, source, search, and creator', async () => {
        const team = newId();
        const creator = newId();
        await store.alerts.create(team, {
          ...base,
          displayName: 'Checkout latency',
          tags: ['prod'],
          createdBy: creator,
        });
        await store.alerts.create(team, {
          ...base,
          displayName: 'Other',
          source: AlertSource.TILE,
          dashboard: newId(),
          tileId: 't',
        });
        const count = (f: Parameters<typeof store.alerts.countPage>[1]) =>
          store.alerts.countPage(team, f);
        expect(await count({ tags: ['prod'] })).toBe(1);
        expect(await count({ search: 'LATENCY' })).toBe(1);
        expect(await count({ sources: [AlertSource.TILE] })).toBe(1);
        expect(await count({ states: [AlertState.OK] })).toBe(2);
        expect(await count({ states: [AlertState.ALERT] })).toBe(0);
        expect(await count({ createdBy: creator })).toBe(1);
      });
    });

    describe('transactional deletes', () => {
      it('deletes a saved search with its alerts only', async () => {
        const team = newId();
        const search = await store.savedSearches.create(team, {
          name: 'S',
          source: newId(),
        });
        const mine = await store.alerts.create(team, {
          ...base,
          savedSearch: search._id,
        });
        const other = await store.alerts.create(team, {
          ...base,
          savedSearch: newId(),
        });
        expect(
          await store.savedSearches.deleteWithAlerts(newId(), search._id),
        ).toBeNull();
        expect(await store.alerts.get(team, mine._id)).not.toBeNull();
        expect(
          (await store.savedSearches.deleteWithAlerts(team, search._id))?.name,
        ).toBe('S');
        expect(await store.savedSearches.get(team, search._id)).toBeNull();
        expect(await store.alerts.get(team, mine._id)).toBeNull();
        expect(await store.alerts.get(team, other._id)).not.toBeNull();
      });

      it('deletes a dashboard with its tile alerts only', async () => {
        const team = newId();
        const dash = await store.dashboards.create(
          team,
          loose<never>({ name: 'D', tiles: [], tags: [] }),
        );
        const tile = await store.alerts.create(team, {
          ...base,
          source: AlertSource.TILE,
          dashboard: dash._id,
          tileId: 't',
        });
        expect(
          (await store.dashboards.deleteWithAlerts(team, dash._id))?._id,
        ).toBe(dash._id);
        expect(await store.alerts.get(team, tile._id)).toBeNull();
        expect(
          await store.dashboards.deleteWithAlerts(team, dash._id),
        ).toBeNull();
      });

      it('removes a member and hands their alerts over atomically', async () => {
        const team = await store.teams.createFirst({ name: 'T' });
        const [a, b] = await Promise.all(
          ['a', 'b'].map(n =>
            store.users.register(
              { email: `${n}${newId()}@x.io`, team: team._id },
              'pw-12345678',
            ),
          ),
        );
        const alert = await store.alerts.create(team._id, {
          ...base,
          createdBy: b._id,
        });
        expect(await store.users.removeMember(team._id, b._id, a._id)).toBe(
          'deleted',
        );
        expect((await store.alerts.get(team._id, alert._id))?.createdBy).toBe(
          a._id,
        );
        expect(await store.users.removeMember(team._id, a._id, a._id)).toBe(
          'last_member',
        );
      });
    });

    describe('alert history', () => {
      it('expires rows 30 days after createdAt and keeps the expiry on update', async () => {
        const alert = newId();
        // Recent, so the 30-day expiry is still in the future whenever this runs.
        const window = new Date(Date.now() - 60 * MINUTE);
        await store.alertHistory.upsertErrorRow(alert, window, [
          queryError(window, 'one'),
        ]);
        const key = `err::${alert}::${window.getTime()}`;
        // Couchbase keeps expiry in whole seconds, so allow one second.
        const expectedExpiry = window.getTime() + 30 * DAY;
        const within1s = (d?: Date) =>
          Math.abs((d?.getTime() ?? 0) - expectedExpiry) < 1000;
        const first = await store.kv.get('alert_history', key);
        expect(within1s(first?.expiry)).toBe(true);
        await store.alertHistory.upsertErrorRow(alert, window, [
          queryError(window, 'two'),
        ]);
        const second = await store.kv.get<{ errors: { message: string }[] }>(
          'alert_history',
          key,
        );
        expect(second?.value.errors[0].message).toBe('two');
        expect(within1s(second?.expiry)).toBe(true);
      });

      it('keeps rows for windows older than the retention for a day', async () => {
        const alert = newId();
        const old = new Date(Date.now() - 60 * DAY);
        await store.alertHistory.upsertErrorRow(alert, old, [
          queryError(old, 'old'),
        ]);
        const got = await store.kv.get(
          'alert_history',
          `err::${alert}::${old.getTime()}`,
        );
        const left = (got?.expiry?.getTime() ?? 0) - Date.now();
        expect(left).toBeGreaterThan(DAY - 60_000);
        expect(left).toBeLessThanOrEqual(DAY + 60_000);
      });

      it('writes rows independently', async () => {
        const alert = newId();
        const results = await store.alertHistory.createMany([
          row(alert, 5),
          loose<IAlertHistory>({ ...row(alert, 6), state: 'NOPE' }),
        ]);
        expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected']);
      });

      it('returns the newest non-ERROR row per group', async () => {
        const alert = newId();
        await store.alertHistory.createMany([
          row(alert, 5, { group: 'a', state: AlertState.ALERT }),
          row(alert, 10, { group: 'a', state: AlertState.OK }),
          row(alert, 10, { group: 'b', state: AlertState.PENDING }),
          row(alert, 15, { state: AlertState.ERROR }),
        ]);
        const latest = await store.alertHistory.latestPerGroup(alert, {
          lte: at(20),
        });
        const byGroup = Object.fromEntries(latest.map(r => [r.group, r.state]));
        expect(byGroup).toEqual({ a: AlertState.OK, b: AlertState.PENDING });
        expect(
          await store.alertHistory.latestPerGroup(alert, { lte: at(7) }),
        ).toMatchObject([{ group: 'a', state: AlertState.ALERT }]);
      });

      it('groups rows into windows, newest first, ERROR included', async () => {
        const alert = newId();
        await store.alertHistory.createMany([
          row(alert, 5, { counts: 2, group: 'a' }),
          row(alert, 5, { counts: 3, group: 'b', state: AlertState.ALERT }),
          row(alert, 10, { counts: 4 }),
          row(alert, 10, {
            state: AlertState.ERROR,
            counts: 0,
            lastValues: [],
            errors: [queryError(at(10), 'x')],
          }),
        ]);
        const grouped = await store.alertHistory.groupedByWindow(
          alert,
          { lte: at(20) },
          10,
        );
        expect(grouped.map(g => g.createdAt)).toEqual([at(10), at(5)]);
        expect(grouped[1]).toMatchObject({ counts: 5 });
        expect(grouped[1].states.sort()).toEqual(['ALERT', 'OK']);
        expect(grouped[0].errors).toHaveLength(1);
        // A window with no error rows reads as [], not null.
        expect(grouped[1].errors).toEqual([]);
        expect(
          await store.alertHistory.groupedByWindow(alert, { lte: at(20) }, 1),
        ).toHaveLength(1);

        const windows = await store.alertHistory.structuredWindows(
          alert,
          { lte: at(20) },
          10,
        );
        expect(windows[1].rows.map(r => r.group).sort()).toEqual(['a', 'b']);
      });

      // D12: rows sharing createdAt read back in write order everywhere,
      // not in whatever order the data store aggregates or scans them.
      it('reads same-window rows back in write order in every reader', async () => {
        const alert = newId();
        await store.alertHistory.createMany([
          row(alert, 5, { group: 'c' }),
          row(alert, 5, { group: 'a' }),
          row(alert, 5, { group: 'b' }),
        ]);
        // A later write for the same window (a same-window re-evaluation).
        await store.alertHistory.createMany([
          row(alert, 5, { group: 'a', state: AlertState.ALERT }),
        ]);
        const range = { lte: at(20) };
        const writeOrder = ['c', 'a', 'b', 'a'];

        const rows = await store.alertHistory.rows(alert, range);
        expect(rows.map(r => r.group)).toEqual(writeOrder);
        // The sequence is a storage detail, not part of a history row.
        expect(rows[0]).not.toHaveProperty('seq');

        const [w] = await store.alertHistory.structuredWindows(
          alert,
          range,
          10,
        );
        expect(w.rows.map(r => r.group)).toEqual(writeOrder);

        const [g] = await store.alertHistory.groupedByWindow(alert, range, 10);
        expect(g.states).toEqual(['OK', 'OK', 'OK', 'ALERT']);
        expect(g.lastValues).toHaveLength(4);

        const [t] = await store.alertHistory.transitionWindows(alert, range);
        expect(t.states).toEqual(['OK', 'OK', 'OK', 'ALERT']);

        const latest = await store.alertHistory.latestPerGroup(alert, range);
        expect(latest.find(r => r.group === 'a')?.state).toBe(AlertState.ALERT);

        // Per group, newest first: the later write leads.
        const consecutive = await store.alertHistory.rangeExcludingErrors(
          alert,
          range,
        );
        expect(
          consecutive.filter(r => r.group === 'a').map(r => r.state),
        ).toEqual([AlertState.ALERT, AlertState.OK]);
      });

      it('lists transitions oldest first without ERROR rows', async () => {
        const alert = newId();
        await store.alertHistory.createMany([
          row(alert, 5, { state: AlertState.ALERT }),
          row(alert, 10, { state: AlertState.OK }),
          row(alert, 12, { state: AlertState.ERROR }),
        ]);
        const windows = await store.alertHistory.transitionWindows(alert, {
          gte: at(0),
          lte: at(20),
        });
        expect(windows.map(w => w.createdAt)).toEqual([at(5), at(10)]);
        expect(windows[0].bucketStarts).toEqual([[at(0)]]);
      });

      it('deletes ERROR rows in a range, exclusive at the start', async () => {
        const alert = newId();
        const err = (n: number) =>
          row(alert, n, { state: AlertState.ERROR, lastValues: [], counts: 0 });
        await store.alertHistory.createMany([err(5), err(10), row(alert, 10)]);
        await store.alertHistory.upsertErrorRow(alert, at(15), []);
        const removed = await store.alertHistory.deleteErrorRows(alert, {
          gt: at(5),
          lte: at(10),
        });
        expect(removed).toBe(1);
        expect(await store.alertHistory.deleteErrorRows(alert, at(15))).toBe(1);
        const left = await store.alertHistory.groupedByWindow(
          alert,
          { lte: at(20) },
          10,
        );
        expect(left.map(g => g.createdAt)).toEqual([at(10), at(5)]);
      });
    });
  });
}
