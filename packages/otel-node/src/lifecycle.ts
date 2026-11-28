import { constants } from 'node:os';
import { inspect } from 'node:util';
import { isMainThread } from 'node:worker_threads';

import { metrics, trace } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';

import { report } from './env';
import { getState } from './state';

const DEFAULT_TIMEOUT_MILLIS = 5000;
const SENTRY_SEND_MILLIS = 2000;
const SIGNALS = ['SIGTERM', 'SIGINT'] as const;

/** Resolves with whether `work` settled within `ms`; never rejects. */
function bounded(
  work: () => Promise<unknown>,
  ms: number,
  keepAlive: boolean,
): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const deadline = new Promise<boolean>(resolve => {
    timer = setTimeout(resolve, ms, false);
    if (!keepAlive) timer.unref();
  });
  const settled = Promise.resolve()
    .then(work)
    .then(() => true);
  return Promise.race([settled, deadline]).then(inTime => {
    clearTimeout(timer);
    if (!inTime) {
      report('warn', `flush or shutdown did not finish within ${ms} ms`);
    }
    return inTime;
  });
}

function timeoutOf(timeoutMillis: number | undefined): number {
  return timeoutMillis !== undefined && timeoutMillis > 0
    ? Math.min(timeoutMillis, 2_147_483_647)
    : DEFAULT_TIMEOUT_MILLIS;
}

function sdkShutdown(): Promise<void> {
  const state = getState();
  const sdk = state.sdk;
  if (sdk === undefined) return Promise.resolve();
  return (state.shutdownPromise ??= (async () => {
    await state.flushInFlight;
    try {
      await sdk.shutdown();
    } catch (error) {
      report('warn', 'shutdown failed', error);
    }
    state.unsubscribeUndici?.();
  })());
}

type Flushable = { forceFlush?: (options?: unknown) => Promise<void> };

/**
 * Exports what the tracer, meter and logger providers have buffered, without
 * stopping the SDK. Resolves at once before `init`; after {@link shutdown} it
 * waits for the shutdown. Never rejects.
 *
 * @param timeoutMillis - Upper bound, 5000 ms by default.
 */
export async function flush(timeoutMillis?: number): Promise<void> {
  const state = getState();
  if (state.sdk === undefined) return;
  const ms = timeoutOf(timeoutMillis);
  const pending = state.shutdownPromise;
  if (pending !== undefined) {
    await bounded(() => pending, ms, false);
    return;
  }
  const tracer = trace.getTracerProvider() as { getDelegate?: () => unknown };
  const providers = [
    tracer.getDelegate?.() ?? tracer,
    metrics.getMeterProvider(),
    logs.getLoggerProvider(),
  ] as Flushable[];
  const work = Promise.all(
    providers.map(async provider => {
      if (typeof provider.forceFlush !== 'function') return;
      try {
        await provider.forceFlush({ timeoutMillis: ms });
      } catch (error) {
        report('warn', 'flush failed', error);
      }
    }),
  );
  state.flushInFlight = Promise.all([state.flushInFlight, work]);
  await bounded(() => work, ms, false);
}

/**
 * Flushes and stops the SDK; telemetry recorded afterwards is dropped. Later
 * calls, and the automatic shutdown on `beforeExit`, SIGTERM, SIGINT and
 * uncaught exceptions, share the first call's work. Never rejects.
 *
 * @param timeoutMillis - Upper bound, 5000 ms by default.
 */
export async function shutdown(timeoutMillis?: number): Promise<void> {
  if (getState().sdk === undefined) return;
  await bounded(sdkShutdown, timeoutOf(timeoutMillis), false);
}

function writeFatal(error: unknown): void {
  try {
    const body =
      typeof error === 'string'
        ? error
        : inspect(error, { customInspect: false, depth: 5 });
    process
      .getBuiltinModule('node:fs')
      .writeSync(2, `${body}\n\nNode.js ${process.version}\n`);
  } catch {
    // Nothing left to report to.
  }
}

/** Listeners that `signal-exit` (v3 and v4) adds for its own bookkeeping. */
function signalExitListeners(): number {
  const v4 = (globalThis as Record<symbol, { count?: unknown } | undefined>)[
    Symbol.for('signal-exit emitter')
  ];
  const v3 = (process as { __signal_exit_emitter__?: { count?: unknown } })
    .__signal_exit_emitter__;
  return [v4?.count, v3?.count].reduce<number>(
    (sum, count) => sum + (typeof count === 'number' ? count : 0),
    0,
  );
}

type Listener = ((...args: any[]) => void) & { _errorHandler?: boolean };

/**
 * Installs the `beforeExit`, SIGTERM, SIGINT and `uncaughtException`
 * handlers. Signal and crash handlers go on the main thread only: workers
 * never receive signals, and a worker crash listener would hide the parent's
 * `error` event.
 */
export function installLifecycle(): void {
  let terminating = false;
  let terminatingSince = 0;
  process.once('beforeExit', () => {
    if (terminating) return;
    void bounded(sdkShutdown, DEFAULT_TIMEOUT_MILLIS, false).then(inTime => {
      if (!inTime) process.exit();
    });
  });
  if (!isMainThread) return;

  const onSignal = (signal: NodeJS.Signals) => {
    const code = 128 + (constants.signals[signal] ?? 0);
    if (terminating) {
      // A second signal a second later forces the exit.
      if (Date.now() - terminatingSince > 1000) process.exit(code);
      return;
    }
    // When the app handles the signal itself, it owns the exit; flush and
    // step aside.
    const others = process
      .listeners(signal)
      .filter(listener => listener !== onSignal).length;
    if (others > signalExitListeners()) {
      process.removeListener(signal, onSignal);
      void flush();
      return;
    }
    terminating = true;
    terminatingSince = Date.now();
    void bounded(sdkShutdown, DEFAULT_TIMEOUT_MILLIS, true).then(() => {
      for (const name of SIGNALS) process.removeListener(name, onSignal);
      try {
        process.kill(process.pid, signal);
      } catch {
        // Fall through to exit.
      }
      process.exit(code);
    });
  };
  for (const signal of SIGNALS) process.prependListener(signal, onSignal);

  const onUncaughtException = (error: unknown) => {
    try {
      const listeners = process.listeners('uncaughtException') as Listener[];
      const isSentry = (listener: Listener) => listener._errorHandler === true;
      // Another handler decides whether the process survives.
      if (
        listeners.some(
          listener =>
            listener !== onUncaughtException &&
            listener.name !== 'domainUncaughtExceptionClear' &&
            !isSentry(listener),
        )
      ) {
        return;
      }
      process.exitCode = 1;
      if (terminating) return;
      writeFatal(error);
      terminating = true;
      terminatingSince = Date.now();
      const sentry = listeners.some(isSentry)
        ? new Promise(resolve => setTimeout(resolve, SENTRY_SEND_MILLIS))
        : undefined;
      void Promise.all([
        bounded(sdkShutdown, DEFAULT_TIMEOUT_MILLIS, true),
        sentry,
      ]).then(() => {
        process.exit(1);
      });
    } catch {
      process.exit(1);
    }
  };
  process.prependListener('uncaughtException', onUncaughtException);
}
