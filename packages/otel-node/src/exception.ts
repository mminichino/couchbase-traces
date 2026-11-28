import {
  ATTR_EXCEPTION_MESSAGE,
  ATTR_EXCEPTION_STACKTRACE,
} from '@opentelemetry/semantic-conventions';

const MAX_CAUSES = 5;

type ErrorLike = { message?: unknown; stack?: unknown; cause?: unknown };

/**
 * The `exception.*` attributes of a crash record that the logs SDK does not
 * derive itself. A `cause` chain, up to five deep, is appended to the stack
 * as `Caused by:` sections; a thrown non-error is recorded as JSON text.
 */
export function exceptionAttributes(value: unknown): Record<string, string> {
  try {
    if (typeof value === 'string') return {};
    if (!isErrorLike(value)) return { [ATTR_EXCEPTION_MESSAGE]: toText(value) };
    return value.cause === undefined
      ? {}
      : { [ATTR_EXCEPTION_STACKTRACE]: stackWithCauses(value) };
  } catch {
    return {};
  }
}

function isErrorLike(value: unknown): value is ErrorLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    ('message' in value || 'stack' in value)
  );
}

function stackWithCauses(error: ErrorLike): string {
  let text = errorText(error);
  const seen = new Set<unknown>([error]);
  let { cause } = error;
  for (
    let depth = 0;
    depth < MAX_CAUSES && cause !== undefined && !seen.has(cause);
    depth++
  ) {
    seen.add(cause);
    text += `\nCaused by: ${isErrorLike(cause) ? errorText(cause) : toText(cause)}`;
    cause = isErrorLike(cause) ? cause.cause : undefined;
  }
  return text;
}

function errorText(error: ErrorLike): string {
  const header = Error.prototype.toString.call(error);
  const { stack } = error;
  if (typeof stack !== 'string') return header;
  return stack.startsWith(header) ? stack : `${header}\n${stack}`;
}

function toText(value: unknown): string {
  try {
    const json = JSON.stringify(value);
    if (json !== undefined) return json;
  } catch {
    // Cycles and BigInts fall through.
  }
  return String(value);
}
