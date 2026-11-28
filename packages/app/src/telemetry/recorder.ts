/**
 * Session replay recorder on rrweb.
 *
 * Ported from @clickhouse/clickstack-browser 1.2.1 (Apache-2.0), see
 * NOTICE.
 */
import { diag } from '@opentelemetry/api';
import type { Logger } from '@opentelemetry/api-logs';
import type {
  Session,
  SessionManager,
} from '@opentelemetry/browser-sdk/session';
import type { LoggerProvider } from '@opentelemetry/sdk-logs';
import { record } from '@rrweb/record';

import { pageState } from './endpoints';
import { MutationLimiter, type RrwebEvent } from './mutationLimiter';
import {
  ATTR_RRWEB_CHUNK,
  ATTR_RRWEB_EVENT,
  ATTR_RRWEB_OFFSET,
  ATTR_RRWEB_TOTAL_CHUNKS,
  ATTR_SESSION_ID,
  REPLAY_SCOPE_NAME,
  splitIntoChunks,
} from './replayExport';
import {
  FULL_SNAPSHOT,
  isFromBlockedFrame,
  isUserInput,
  META,
} from './rrwebEvents';
import { VERSION } from './rum';

/** Replay stops for a session once it is this old (4 hours). */
// Replay offsets and the cap need the current wall clock; the app's NOW
// constant is fixed at load.
const now = () => performance.timeOrigin + performance.now();

const MAX_REPLAY_PER_SESSION_MS = 14_400_000;

type RecordOptions = NonNullable<Parameters<typeof record<RrwebEvent>>[0]>;

/** The parts of the browser SDK's SessionManager the recorder uses. */
export type SessionSource = Pick<
  SessionManager,
  'getSessionId' | 'getSession' | 'addObserver'
>;

type RecorderOptions = {
  sessionManager: SessionSource;
  provider: LoggerProvider;
  maskAllText: boolean;
  maskAllInputs: boolean;
};

/**
 * Records the page with rrweb and emits each event as `rr-web.*` log records
 * of the current session.
 *
 * After a session change nothing is recorded until the tab is visible and
 * the user interacts; then a full snapshot opens the session. That way an
 * idle tab, which rotates its session every inactivity timeout, stores no
 * snapshots nobody watches. The session id is cached from the manager's
 * observer, because `getSessionId()` counts as activity and DOM mutations
 * alone must not keep a session alive.
 */
export class Recorder {
  readonly #sessionManager: SessionSource;
  readonly #provider: LoggerProvider;
  readonly #logger: Logger;
  readonly #recordOptions: RecordOptions;
  readonly #limiter = new MutationLimiter(() => this.#onThrottled());
  #sessionId = '';
  #sessionStart = 0;
  #events = 0;
  #offset = 0;
  #stopRrweb: (() => void) | undefined;
  #waitingForVisible = false;
  #waitingForInput = false;
  #needsSnapshot = false;
  #snapshotQueued = false;
  #capReached = false;
  #stopped = false;
  #warned = false;
  #snapshotTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(options: RecorderOptions) {
    this.#sessionManager = options.sessionManager;
    this.#provider = options.provider;
    this.#logger = options.provider.getLogger(REPLAY_SCOPE_NAME, VERSION);
    this.#recordOptions = {
      ...(options.maskAllText ? { maskTextSelector: '*' } : {}),
      maskInputOptions: options.maskAllInputs
        ? { input: true, textarea: true, select: true }
        : { password: true },
      userTriggeredOnInput: true,
    } as RecordOptions;
  }

  start(): void {
    pageState().recording = true;
    setTimeout(() => this.#begin(), 0);
  }

  async shutdown(): Promise<void> {
    this.#stopped = true;
    this.#reconcile();
    document.removeEventListener('visibilitychange', this);
    document.removeEventListener('DOMContentLoaded', this);
    pageState().recording = false;
    await this.#provider.shutdown();
  }

  /** Listener for `visibilitychange` and `DOMContentLoaded`. */
  handleEvent(event: Event): void {
    if (event.type === 'DOMContentLoaded') {
      this.#reconcile();
    } else if (
      this.#waitingForVisible &&
      document.visibilityState === 'visible'
    ) {
      this.#waitingForVisible = false;
      this.#requestSnapshot();
    }
  }

  #begin(): void {
    if (this.#stopped) return;
    const manager = this.#sessionManager;
    this.#enterSession(
      manager.getSessionId() ?? '',
      manager.getSession?.()?.startTimestamp,
    );
    manager.addObserver({
      onSessionStarted: session => this.#onSessionStarted(session),
      onSessionEnded: () => undefined,
    });
    document.addEventListener('visibilitychange', this);
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', this, { once: true });
    } else {
      this.#reconcile();
    }
  }

  #enterSession(id: string, startTimestamp: number | undefined): void {
    this.#sessionId = id;
    this.#sessionStart = startTimestamp ?? now();
    // Random start so event numbers do not collide across page loads.
    this.#events = Math.floor(Math.random() * 2 ** 52);
    this.#offset = now() * 1000;
    this.#limiter.reset();
    this.#capReached = now() - this.#sessionStart > MAX_REPLAY_PER_SESSION_MS;
  }

  #onSessionStarted(session: Session): void {
    if (this.#stopped) return;
    this.#enterSession(session.id, session.startTimestamp);
    this.#waitingForVisible = document.visibilityState !== 'visible';
    this.#waitingForInput = !this.#waitingForVisible;
    this.#needsSnapshot = true;
    this.#reconcile();
  }

  #reconcile(): void {
    const shouldRun = !this.#stopped && !this.#capReached;
    if (shouldRun && this.#stopRrweb === undefined) {
      this.#needsSnapshot = true;
      this.#stopRrweb = () => undefined;
      this.#stopRrweb =
        record<RrwebEvent>({
          ...this.#recordOptions,
          emit: event => this.#emit(event),
          errorHandler: error => {
            this.#warnOnce('rrweb failed', error);
            return true;
          },
        }) ?? (() => undefined);
    } else if (!shouldRun && this.#stopRrweb !== undefined) {
      const stop = this.#stopRrweb;
      this.#stopRrweb = undefined;
      clearTimeout(this.#snapshotTimer);
      stop();
    }
  }

  #requestSnapshot(): void {
    this.#needsSnapshot = true;
    if (this.#snapshotQueued) return;
    this.#snapshotQueued = true;
    queueMicrotask(() => {
      this.#snapshotQueued = false;
      if (this.#stopRrweb !== undefined && !this.#isGated()) {
        record.takeFullSnapshot(true);
      }
    });
  }

  #isGated(): boolean {
    return this.#waitingForVisible || this.#waitingForInput;
  }

  #emit(event: RrwebEvent): void {
    if (this.#stopRrweb === undefined) return;
    if (isUserInput(event)) {
      this.#sessionManager.getSessionId();
      if (this.#waitingForInput) {
        this.#waitingForInput = false;
        this.#requestSnapshot();
        return;
      }
    }
    if (this.#isGated()) return;
    if (this.#needsSnapshot) {
      if (event.type === FULL_SNAPSHOT) this.#needsSnapshot = false;
      else if (event.type !== META) return;
    }
    if (event.timestamp - this.#sessionStart > MAX_REPLAY_PER_SESSION_MS) {
      this.#capReached = true;
      queueMicrotask(() => this.#reconcile());
      return;
    }
    if (isFromBlockedFrame(event)) return;
    const kept = this.#limiter.filter(
      event,
      id => record.mirror.getNode(id),
      performance.now(),
    );
    if (kept !== undefined) this.#send(kept);
  }

  #send(event: RrwebEvent): void {
    const chunks = splitIntoChunks(JSON.stringify(event));
    const eventNumber = ++this.#events;
    chunks.forEach((body, index) => {
      this.#logger.emit({
        timestamp: event.timestamp,
        body,
        attributes: {
          [ATTR_SESSION_ID]: this.#sessionId,
          [ATTR_RRWEB_EVENT]: eventNumber,
          [ATTR_RRWEB_CHUNK]: index + 1,
          [ATTR_RRWEB_TOTAL_CHUNKS]: chunks.length,
          [ATTR_RRWEB_OFFSET]: ++this.#offset,
        },
      });
    });
  }

  #onThrottled(): void {
    this.#warnOnce(
      'replay drops attribute changes of nodes that change too often',
    );
    clearTimeout(this.#snapshotTimer);
    this.#snapshotTimer = setTimeout(() => this.#requestSnapshot(), 1000);
  }

  #warnOnce(message: string, ...args: unknown[]): void {
    if (this.#warned) return;
    this.#warned = true;
    diag.warn(`couchbase-traces browser telemetry: ${message}`, ...args);
  }
}
