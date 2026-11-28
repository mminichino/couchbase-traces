/**
 * RUM processors: exceptions, console serialization, user and custom
 * attributes.
 *
 * Ported from @clickhouse/clickstack-browser 1.2.1 (Apache-2.0), see
 * NOTICE.
 */
import type { Attributes } from '@opentelemetry/api';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';
import type { LogRecordProcessor, SdkLogRecord } from '@opentelemetry/sdk-logs';
import type { Span, SpanProcessor } from '@opentelemetry/sdk-trace';
import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
  ATTR_EXCEPTION_TYPE,
  ATTR_URL_FULL,
} from '@opentelemetry/semantic-conventions';

export const SCOPE = '@couchbase-traces/browser-telemetry';
export const VERSION = '1.0.0';

const MAX_CAUSES = 5;

type ErrorLike = {
  name?: unknown;
  message?: unknown;
  stack?: unknown;
  cause?: unknown;
};

function isErrorLike(value: unknown): value is ErrorLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('message' in value || 'stack' in value)
  );
}

function toText(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (json !== undefined) return json;
  } catch {
    // Circular or BigInt values fall through to String().
  }
  return String(value);
}

function errorText(error: ErrorLike): string {
  const header = Error.prototype.toString.call(error);
  const { stack } = error;
  if (typeof stack !== 'string') return header;
  return stack.startsWith(header) ? stack : `${header}\n${stack}`;
}

/** The stack with up to five `cause`s appended as `Caused by:` sections. */
function stackWithCauses(error: ErrorLike): string | undefined {
  let text = typeof error.stack === 'string' ? error.stack : undefined;
  const seen = new Set<unknown>([error]);
  let { cause } = error;
  for (
    let depth = 0;
    depth < MAX_CAUSES && cause !== undefined && !seen.has(cause);
    depth++
  ) {
    seen.add(cause);
    const causeText = isErrorLike(cause) ? errorText(cause) : toText(cause);
    text = `${text ?? Error.prototype.toString.call(error)}\nCaused by: ${causeText}`;
    cause = isErrorLike(cause) ? cause.cause : undefined;
  }
  return text;
}

/**
 * `exception.*` attributes for a thrown value. Values that are not errors are
 * recorded as JSON text, because upstream records them with no message.
 */
export function exceptionAttributes(value: unknown): Attributes {
  if (typeof value === 'string') return { [ATTR_EXCEPTION_MESSAGE]: value };
  if (isErrorLike(value)) {
    const { name, message } = value;
    const stacktrace = stackWithCauses(value);
    return {
      ...(typeof name === 'string' ? { [ATTR_EXCEPTION_TYPE]: name } : {}),
      ...(typeof message === 'string'
        ? { [ATTR_EXCEPTION_MESSAGE]: message }
        : {}),
      ...(stacktrace === undefined
        ? {}
        : { [ATTR_EXCEPTION_STACKTRACE]: stacktrace }),
    };
  }
  return { [ATTR_EXCEPTION_MESSAGE]: toText(value) };
}

function consoleText(arg: unknown): string {
  if (arg instanceof Error) return errorText(arg);
  if (typeof arg === 'object' && arg !== null) {
    try {
      return JSON.stringify(arg);
    } catch {
      return Object.prototype.toString.call(arg);
    }
  }
  return String(arg);
}

function numberText(arg: unknown, parse: (text: string) => number): string {
  return typeof arg === 'symbol' ? 'NaN' : String(parse(String(arg)));
}

let consoleError: Error | undefined;

/**
 * Serializes console arguments as the browser console shows them: format
 * codes in a leading string consume the following arguments, and errors
 * appear as message and stack (upstream's default gives `{}`). Remembers the
 * first error for {@link consoleExceptionProcessor}.
 */
export function serializeConsoleArgs(args: unknown[]): string {
  consoleError = args.find((arg): arg is Error => arg instanceof Error);
  const [first, ...rest] = args;
  if (typeof first !== 'string' || rest.length === 0) {
    return args.map(consoleText).join(' ');
  }
  let used = 0;
  const formatted = first.replace(/%(.)/g, (code, specifier: string) => {
    if (specifier === '%') return '%';
    if (used >= rest.length) return code;
    switch (specifier) {
      case 's':
      case 'o':
      case 'O':
        return consoleText(rest[used++]);
      case 'd':
      case 'i':
        return numberText(rest[used++], text => Number.parseInt(text, 10));
      case 'f':
        return numberText(rest[used++], Number.parseFloat);
      case 'c':
        used++;
        return '';
      default:
        return code;
    }
  });
  return [formatted, ...rest.slice(used).map(consoleText)].join(' ');
}

const noop = {
  forceFlush: () => Promise.resolve(),
  shutdown: () => Promise.resolve(),
};

/**
 * Adds `exception.*` to a console record whose arguments included an error.
 * The console instrumentation serializes and then emits in the same call, so
 * the remembered error belongs to the next record.
 */
export const consoleExceptionProcessor: LogRecordProcessor = {
  ...noop,
  onEmit: (logRecord: SdkLogRecord) => {
    const error = consoleError;
    consoleError = undefined;
    if (error !== undefined && logRecord.eventName === 'browser.console') {
      logRecord.setAttributes(exceptionAttributes(error));
    }
  },
};

function resourceUrl(element: Element): string {
  if (
    element instanceof HTMLImageElement ||
    element instanceof HTMLMediaElement
  ) {
    return element.currentSrc || element.src;
  }
  if (
    element instanceof HTMLScriptElement ||
    element instanceof HTMLSourceElement ||
    element instanceof HTMLTrackElement
  ) {
    return element.src;
  }
  if (element instanceof HTMLLinkElement) return element.href;
  return '';
}

/**
 * Records failed loads of images, scripts, stylesheets, and media as
 * `ResourceLoadError` exceptions. These `error` events do not bubble, so the
 * upstream errors instrumentation never sees them.
 *
 * @returns A function that removes the listener.
 */
export function listenForResourceErrors(): () => void {
  const onError = ({ target }: Event) => {
    if (!(target instanceof Element)) return;
    const recorded = resourceUrl(target);
    if (!recorded) return;
    const element = `<${target.tagName.toLowerCase()}>`;
    logs.getLogger(SCOPE, VERSION).emit({
      eventName: 'exception',
      severityNumber: SeverityNumber.ERROR,
      attributes: {
        [ATTR_EXCEPTION_TYPE]: 'ResourceLoadError',
        [ATTR_EXCEPTION_MESSAGE]: `Failed to load ${element} ${recorded}`,
        [ATTR_URL_FULL]: recorded,
      },
    });
  };
  window.addEventListener('error', onError, true);
  return () => window.removeEventListener('error', onError, true);
}

export type TelemetryUser = {
  id?: string;
  email?: string;
  name?: string;
  fullName?: string;
  roles?: string[];
};

let userAttributes: Attributes = {};
let customAttributes: Attributes = {};

/**
 * Sets the user on every span and log record emitted from now on. Works
 * before init. Empty fields are left out; `null` clears the user.
 */
export function setUser(user: TelemetryUser | null): void {
  const next: Attributes = {};
  if (user?.id) next['user.id'] = user.id;
  if (user?.email) next['user.email'] = user.email;
  if (user?.name) next['user.name'] = user.name;
  if (user?.fullName) next['user.full_name'] = user.fullName;
  if (user?.roles?.length) next['user.roles'] = [...user.roles];
  userAttributes = next;
}

/**
 * Sets attributes on every span and log record emitted from now on,
 * replacing the previous set. Attributes set by the SDK or `setUser` win.
 */
export function setAttributes(attributes: Attributes | null): void {
  customAttributes = { ...attributes };
}

function missingFrom(current: Record<string, unknown>): Attributes {
  const missing: Attributes = {};
  for (const [key, value] of Object.entries(customAttributes)) {
    if (!(key in current)) missing[key] = value;
  }
  return missing;
}

export const userSpanProcessor: SpanProcessor = {
  ...noop,
  onStart: (span: Span) => {
    span.setAttributes(userAttributes);
  },
  onEnd: () => undefined,
};

export const userLogRecordProcessor: LogRecordProcessor = {
  ...noop,
  onEmit: (logRecord: SdkLogRecord) => {
    logRecord.setAttributes(userAttributes);
  },
};

/** Runs after the other span processors, so it never overwrites them. */
export const attributesSpanProcessor: SpanProcessor = {
  ...noop,
  onStart: (span: Span) => {
    span.setAttributes(missingFrom(span.attributes));
  },
  onEnd: () => undefined,
};

export const attributesLogRecordProcessor: LogRecordProcessor = {
  ...noop,
  onEmit: (logRecord: SdkLogRecord) => {
    logRecord.setAttributes(missingFrom(logRecord.attributes));
  },
};
