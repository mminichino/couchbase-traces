import { newId } from '@/metadata/ids';
import { AlertState } from '@/metadata/schemas/alert';
import { describeAlertRepos } from '@/metadata/testing/alertsContract';
import { createMemoryStore } from '@/metadata/testing/memoryStore';

describeAlertRepos('memory', async () => createMemoryStore());

describe('alert history write order across a clock step (D12)', () => {
  it('reads a later write after an earlier one even when its key sorts first', async () => {
    // A key's leading bytes are seconds of the writer's clock, so a write
    // after the clock steps back (NTP, another replica) gets a smaller key.
    let clock = new Date('2026-11-01T00:10:00.000Z');
    const store = createMemoryStore({ now: () => clock });
    const alert = newId();
    const createdAt = new Date('2026-11-01T00:05:00.000Z');
    const row = (group: string, state: AlertState) => ({
      alert,
      counts: 1,
      createdAt,
      state,
      group,
      lastValues: [{ startTime: createdAt, count: 1 }],
    });

    await store.alertHistory.createMany([row('a', AlertState.OK)]);
    clock = new Date('2026-11-01T00:09:00.000Z');
    await store.alertHistory.createMany([row('a', AlertState.ALERT)]);

    const rows = await store.alertHistory.rows(alert);
    expect(rows[1]._id < rows[0]._id).toBe(true);
    expect(rows.map(r => r.state)).toEqual([AlertState.OK, AlertState.ALERT]);
    const [latest] = await store.alertHistory.latestPerGroup(alert, {});
    expect(latest.state).toBe(AlertState.ALERT);
    const [w] = await store.alertHistory.structuredWindows(alert, {}, 10);
    expect(w.rows.map(r => r.state)).toEqual([AlertState.OK, AlertState.ALERT]);
  });
});
