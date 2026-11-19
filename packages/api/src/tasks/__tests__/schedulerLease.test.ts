import { getMetadataStore, setMetadataStoreForTests } from '@/metadata';
import { createMemoryStore } from '@/metadata/testing/memoryStore';
import {
  CHECK_ALERTS_LOCK,
  runWithSchedulerLease,
} from '@/tasks/schedulerLease';

jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const opts = { enabled: true, tickMs: 60_000 };

describe('runWithSchedulerLease', () => {
  beforeEach(() => setMetadataStoreForTests(createMemoryStore()));
  afterEach(() => setMetadataStoreForTests(null));

  it('runs once when two runners start the same tick', async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => (release = resolve));
    const first = jest.fn(() => gate);
    const second = jest.fn(async () => {});

    const a = runWithSchedulerLease(opts, first);
    await new Promise(resolve => setImmediate(resolve));
    const skipped = await runWithSchedulerLease(opts, second);
    release();

    expect(await a).toBe(true);
    expect(skipped).toBe(false);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('frees the lease after a tick so the next one runs', async () => {
    const fn = jest.fn(async () => {});
    expect(await runWithSchedulerLease(opts, fn)).toBe(true);
    expect(await runWithSchedulerLease(opts, fn)).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('frees the lease when the task throws', async () => {
    await expect(
      runWithSchedulerLease(opts, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await runWithSchedulerLease(opts, async () => {})).toBe(true);
  });

  it('lets the next tick proceed after a crashed holder expires', async () => {
    let now = new Date('2026-01-01T00:00:00Z');
    setMetadataStoreForTests(createMemoryStore({ now: () => now }));
    const crashed = await getMetadataStore().locks.acquire(
      CHECK_ALERTS_LOCK,
      opts.tickMs * 2,
      'crashed-runner',
    );
    expect(crashed).not.toBeNull();

    const fn = jest.fn(async () => {});
    now = new Date(now.getTime() + opts.tickMs);
    expect(await runWithSchedulerLease(opts, fn)).toBe(false);

    now = new Date(now.getTime() + opts.tickMs + 1000);
    expect(await runWithSchedulerLease(opts, fn)).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('renews the lease while a long task runs', async () => {
    jest.useFakeTimers();
    try {
      const store = getMetadataStore();
      const renew = jest.spyOn(store.locks, 'renew');
      let release!: () => void;
      const gate = new Promise<void>(resolve => (release = resolve));
      const run = runWithSchedulerLease(opts, () => gate);
      await jest.advanceTimersByTimeAsync(opts.tickMs * 2 + 10);
      release();
      await run;
      expect(renew).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('skips the lease entirely when disabled', async () => {
    setMetadataStoreForTests(null);
    const fn = jest.fn(async () => {});
    expect(await runWithSchedulerLease({ ...opts, enabled: false }, fn)).toBe(
      true,
    );
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
