import { connectWithAuthRetry } from '@/setup/connect';
import { exitCodeOf, SetupError } from '@/setup/errors';

class AuthenticationFailureError extends Error {
  constructor() {
    super('authentication failure');
    this.name = 'AuthenticationFailureError';
  }
}

/** A connect that rejects the credentials `failures` times, then succeeds. */
function flakyConnect(
  failures: number,
  error: () => Error = () => new AuthenticationFailureError(),
) {
  let calls = 0;
  const fn = jest.fn(async () => {
    calls++;
    if (calls <= failures) throw error();
    return { cluster: calls };
  });
  return fn;
}

/** Fake clock: sleep advances time instantly so tests run in microseconds. */
function fakeClock() {
  let now = 0;
  const sleeps: number[] = [];
  return {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
    sleeps,
  };
}

describe('connectWithAuthRetry (D30)', () => {
  it('retries authentication failures until KV accepts the new password', async () => {
    const clock = fakeClock();
    const connect = flakyConnect(3);
    const log = jest.fn();
    await expect(
      connectWithAuthRetry(connect, { deadlineMs: 60_000, log, ...clock }),
    ).resolves.toEqual({ cluster: 4 });
    expect(connect).toHaveBeenCalledTimes(4);
    expect(clock.sleeps).toEqual([250, 500, 1000]);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('connects at once with no wait when credentials are accepted', async () => {
    const clock = fakeClock();
    const connect = flakyConnect(0);
    await connectWithAuthRetry(connect, {
      deadlineMs: 60_000,
      log: jest.fn(),
      ...clock,
    });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(clock.sleeps).toEqual([]);
  });

  it('caps the backoff and gives up at the deadline with a clear exit-3 error', async () => {
    const clock = fakeClock();
    const connect = flakyConnect(Infinity);
    const err = await connectWithAuthRetry(connect, {
      deadlineMs: 20_000,
      log: jest.fn(),
      ...clock,
    }).catch(e => e);
    expect(err).toBeInstanceOf(SetupError);
    expect(exitCodeOf(err)).toBe(3);
    expect(err.message).toMatch(
      /still rejected the admin credentials after 20s/,
    );
    expect(err.message).toMatch(/CBT_COUCHBASE_ADMIN_USER/);
    expect(Math.max(...clock.sleeps)).toBeLessThanOrEqual(4000);
    expect(clock.now()).toBeLessThanOrEqual(20_000);
  });

  it('does not retry other errors', async () => {
    const clock = fakeClock();
    const connect = flakyConnect(5, () => {
      const e = new Error('unambiguous timeout');
      e.name = 'UnambiguousTimeoutError';
      return e;
    });
    await expect(
      connectWithAuthRetry(connect, {
        deadlineMs: 60_000,
        log: jest.fn(),
        ...clock,
      }),
    ).rejects.toThrow('unambiguous timeout');
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('never logs the password', async () => {
    const clock = fakeClock();
    const log = jest.fn();
    const leaky = () => {
      const e = new AuthenticationFailureError();
      e.message = 'authentication failure for Administrator:s3cret';
      return e;
    };
    const err = await connectWithAuthRetry(flakyConnect(Infinity, leaky), {
      deadlineMs: 2_000,
      log,
      ...clock,
    }).catch(e => e);
    const output = [...log.mock.calls.flat(), err.message].join('\n');
    expect(output).not.toMatch(/s3cret/);
  });
});
