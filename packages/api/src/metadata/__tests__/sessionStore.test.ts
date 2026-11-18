import type { SessionData } from 'express-session';

import { MetadataSessionStore } from '@/metadata/sessionStore';
import { MemoryKv } from '@/metadata/testing/memoryKv';

const DAY = 24 * 60 * 60 * 1000;

function setup() {
  let now = new Date('2026-01-01T00:00:00Z');
  const clock = () => now;
  const kv = new MemoryKv(clock);
  const onTouchError = jest.fn();
  const store = new MetadataSessionStore(() => kv, {
    now: clock,
    onTouchError,
  });
  const call = <T>(fn: (cb: (err?: unknown, v?: T) => void) => void) =>
    new Promise<T | undefined>((resolve, reject) =>
      fn((err, v) => (err ? reject(err) : resolve(v))),
    );
  return {
    kv,
    store,
    onTouchError,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
    now: () => now,
    get: (sid: string) => call<SessionData | null>(cb => store.get(sid, cb)),
    set: (sid: string, s: SessionData) => call(cb => store.set(sid, s, cb)),
    touch: (sid: string, s: SessionData) => call(cb => store.touch(sid, s, cb)),
    destroy: (sid: string) => call(cb => store.destroy(sid, cb)),
  };
}

// express-session types `cookie` as a Cookie instance; the store only reads
// plain JSON, so tests build raw shapes through this one escape hatch.
const asSession = (raw: object): SessionData => raw as unknown as SessionData;

const session = (expires: Date, extra: object = {}): SessionData =>
  asSession({
    cookie: { originalMaxAge: 30 * DAY, expires, httpOnly: true, path: '/' },
    ...extra,
  });

describe('MetadataSessionStore', () => {
  it('stores, reads, and destroys a session', async () => {
    const t = setup();
    const expires = new Date(t.now().getTime() + DAY);
    await t.set('abc', session(expires, { passport: { user: 'u1' } }));
    const got = await t.get('abc');
    expect(got).toMatchObject({ passport: { user: 'u1' } });
    expect(got?.cookie.expires).toBe(expires.toISOString());
    await t.destroy('abc');
    expect(await t.get('abc')).toBeNull();
  });

  it('keys sessions under a prefix with KV expiry from the cookie', async () => {
    const t = setup();
    const expires = new Date(t.now().getTime() + DAY);
    await t.set('abc', session(expires));
    const raw = await t.kv.get<{ expiresAt: string }>('sessions', 'sess::abc');
    expect(raw?.value.expiresAt).toBe(expires.toISOString());
    expect(raw?.expiry).toEqual(expires);
  });

  it('never returns an expired session', async () => {
    const t = setup();
    await t.set('abc', session(new Date(t.now().getTime() + 1000)));
    t.advance(1000);
    expect(await t.get('abc')).toBeNull();
  });

  it('falls back to maxAge, then 30 days, without cookie.expires', async () => {
    const t = setup();
    await t.set('a', asSession({ cookie: { maxAge: 5000 } }));
    await t.set('b', asSession({ cookie: {} }));
    const a = await t.kv.get('sessions', 'sess::a');
    const b = await t.kv.get('sessions', 'sess::b');
    expect(a?.expiry?.getTime()).toBe(t.now().getTime() + 5000);
    expect(b?.expiry?.getTime()).toBe(t.now().getTime() + 30 * DAY);
  });

  it('touch moves the expiry and keeps the body', async () => {
    const t = setup();
    await t.set(
      'abc',
      session(new Date(t.now().getTime() + 1000), { passport: { user: 'u1' } }),
    );
    const later = new Date(t.now().getTime() + 2 * DAY);
    await t.touch('abc', session(later));
    t.advance(DAY);
    expect(await t.get('abc')).toMatchObject({ passport: { user: 'u1' } });
    const raw = await t.kv.get('sessions', 'sess::abc');
    expect(raw?.expiry).toEqual(later);
  });

  it('touch on a missing session is a silent no-op', async () => {
    const t = setup();
    await t.touch('gone', session(new Date(t.now().getTime() + DAY)));
    expect(await t.get('gone')).toBeNull();
    expect(t.onTouchError).not.toHaveBeenCalled();
  });

  it('touch reports unexpected failures without failing the request', async () => {
    const t = setup();
    await t.set('abc', session(new Date(t.now().getTime() + DAY)));
    jest.spyOn(t.kv, 'replace').mockRejectedValueOnce(new Error('boom'));
    await expect(
      t.touch('abc', session(new Date(t.now().getTime() + DAY))),
    ).resolves.toBeUndefined();
    expect(t.onTouchError).toHaveBeenCalledWith(expect.any(Error));
  });

  it('passes read failures to the callback', async () => {
    const t = setup();
    jest.spyOn(t.kv, 'get').mockRejectedValueOnce(new Error('down'));
    await expect(t.get('abc')).rejects.toThrow('down');
  });
});
