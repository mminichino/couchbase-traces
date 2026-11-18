import { describeMetadataContract } from '@/metadata/testing/contract';
import { createMemoryStore } from '@/metadata/testing/memoryStore';

let clock = Date.parse('2026-11-18T00:00:00.000Z');
const now = () => new Date(clock);

describeMetadataContract('memory', async () => {
  const store = createMemoryStore({ now });
  return {
    kv: store.kv,
    now,
    sleep: async ms => {
      clock += ms;
    },
  };
});

describe('memory store', () => {
  it('reports ready until closed', async () => {
    const store = createMemoryStore();
    expect(store.readiness()).toEqual({ ready: true, state: 'ready' });
    await store.close();
    expect(store.readiness().state).toBe('closed');
    store.reset();
    expect(store.readiness().ready).toBe(true);
  });

  it('stores copies, not references', async () => {
    const store = createMemoryStore();
    const value = { tags: ['a'] };
    await store.kv.insert('dashboards', 'k', value);
    value.tags.push('b');
    const got = await store.kv.get<{ tags: string[] }>('dashboards', 'k');
    got!.value.tags.push('c');
    expect((await store.kv.get('dashboards', 'k'))?.value).toEqual({
      tags: ['a'],
    });
    expect(store.kv.keys('dashboards')).toEqual(['k']);
  });
});
