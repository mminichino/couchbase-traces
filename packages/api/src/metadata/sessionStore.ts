import { type SessionData, Store } from 'express-session';

import { CasConflictError, NotFoundError } from '@/metadata/errors';
import type { MetaKv } from '@/metadata/types';

/** Fallback when the cookie carries no expiry; matches the app's 30d maxAge. */
export const DEFAULT_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const PREFIX = 'sess::';

type SessionDoc = { session: SessionData; expiresAt: string };

type Callback<T = void> = (err?: unknown, value?: T) => void;

/**
 * express-session Store over `sessions` (plan D3). One document per session
 * id with KV expiry from `cookie.expires`, so the Data service drops expired
 * sessions; `touch` (rolling cookies) moves the expiry with a CAS replace of
 * the stored body, so it never overwrites a concurrent `set`.
 * `kv` is resolved per call because the app module loads before the store
 * connects.
 */
export class MetadataSessionStore extends Store {
  constructor(
    private readonly kv: () => MetaKv,
    private readonly o: {
      now?: () => Date;
      /** touch failures are swallowed (a rolling refresh is best effort). */
      onTouchError?: (err: unknown) => void;
    } = {},
  ) {
    super();
  }

  private now(): Date {
    return this.o.now?.() ?? new Date();
  }

  private expiryOf(session: SessionData): Date {
    const expires = session.cookie?.expires;
    if (expires != null) return new Date(expires);
    const maxAge = session.cookie?.maxAge;
    return new Date(this.now().getTime() + (maxAge ?? DEFAULT_SESSION_TTL_MS));
  }

  private run<T>(cb: Callback<T> | undefined, fn: () => Promise<T>): void {
    fn().then(
      value => cb?.(null, value),
      err => cb?.(err),
    );
  }

  get(sid: string, cb: Callback<SessionData | null>): void {
    this.run(cb, async () => {
      const doc = await this.kv().get<SessionDoc>('sessions', PREFIX + sid);
      if (!doc) return null;
      // KV expiry runs lazily; never hand back a session past its time.
      if (new Date(doc.value.expiresAt) <= this.now()) {
        await this.kv().remove('sessions', PREFIX + sid);
        return null;
      }
      return doc.value.session;
    });
  }

  set(sid: string, session: SessionData, cb?: Callback): void {
    this.run(cb, async () => {
      const expiry = this.expiryOf(session);
      // JSON form, as the session middleware serializes it: Cookie's getters become fields.
      const doc: SessionDoc = {
        session: JSON.parse(JSON.stringify(session)),
        expiresAt: expiry.toISOString(),
      };
      await this.kv().upsert('sessions', PREFIX + sid, doc, { expiry });
    });
  }

  destroy(sid: string, cb?: Callback): void {
    this.run(cb, async () => {
      await this.kv().remove('sessions', PREFIX + sid);
    });
  }

  touch(sid: string, session: SessionData, cb?: Callback): void {
    this.run(cb, async () => {
      try {
        await this.refresh(PREFIX + sid, session);
      } catch (err) {
        // Destroyed meanwhile, or a concurrent set already moved it.
        if (err instanceof CasConflictError || err instanceof NotFoundError) {
          return;
        }
        this.o.onTouchError?.(err);
      }
    });
  }

  private async refresh(key: string, session: SessionData): Promise<void> {
    const doc = await this.kv().get<SessionDoc>('sessions', key);
    if (!doc) return;
    const expiry = this.expiryOf(session);
    // expiresAt lives in the body, so replace it under CAS; a concurrent set
    // wins and already carries a fresh expiry.
    await this.kv().replace(
      'sessions',
      key,
      { session: doc.value.session, expiresAt: expiry.toISOString() },
      { cas: doc.cas, expiry },
    );
  }
}
