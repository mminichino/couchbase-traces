import {
  diag,
  DiagConsoleLogger,
  type DiagLogger,
  DiagLogLevel,
} from '@opentelemetry/api';
import { diagLogLevelFromString, getStringFromEnv } from '@opentelemetry/core';

import { getState } from './state';

const API_REGISTRY = Symbol.for('opentelemetry.js.api.1');

/** The global registry every copy of `@opentelemetry/api` shares. */
export function apiRegistry(): { diag?: unknown; trace?: unknown } | undefined {
  return (globalThis as Record<symbol, any>)[API_REGISTRY];
}

/**
 * Writes `value` to `process.env[name]` only when the variable is unset or
 * blank, so an operator's setting always wins over a code option.
 */
export function setDefault(name: string, value: string | undefined): void {
  if (value !== undefined && getStringFromEnv(name) === undefined) {
    process.env[name] = value;
  }
}

/**
 * Runs `call` with a console diag logger at `OTEL_LOG_LEVEL` (warn by
 * default) when none is registered. Before NodeSDK starts there is no diag
 * logger, and diag would drop what `call` reports.
 */
export function withStartupLogger<T>(call: () => T): T {
  if (apiRegistry()?.diag !== undefined) return call();
  const sink = new DiagConsoleLogger();
  const logger: DiagLogger = {
    // The console instrumentation reports itself as unpatchable when the
    // bundle tries to patch console a second time; that is expected.
    error: (message, ...args) => {
      if (!message.includes('"@opentelemetry/instrumentation-console"')) {
        sink.error(message, ...args);
      }
    },
    warn: sink.warn,
    info: sink.info,
    debug: sink.debug,
    verbose: sink.verbose,
  };
  diag.setLogger(logger, {
    logLevel:
      diagLogLevelFromString(getStringFromEnv('OTEL_LOG_LEVEL')) ??
      DiagLogLevel.WARN,
    suppressOverrideMessage: true,
  });
  try {
    return call();
  } finally {
    diag.disable();
  }
}

type Level = 'error' | 'warn' | 'info' | 'debug';

/** Writes a prefixed message through diag, also before NodeSDK starts. */
export function report(
  level: Level,
  message: string,
  ...args: unknown[]
): void {
  try {
    withStartupLogger(() => {
      diag[level](`otel-node: ${message}`, ...args);
    });
  } catch {
    // Reporting must never break the app.
  }
}

/** {@link report} at warn level, once per key per thread. */
export function warnOnce(
  key: string,
  message: string,
  ...args: unknown[]
): void {
  const state = getState();
  state.warned ??= new Set();
  if (state.warned.has(key)) return;
  state.warned.add(key);
  report('warn', message, ...args);
}
