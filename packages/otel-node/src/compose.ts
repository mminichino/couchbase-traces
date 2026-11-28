import type { InstrumentationConfigMap } from '@opentelemetry/auto-instrumentations-node';
import { getStringListFromEnv } from '@opentelemetry/core';

import { createHttpBodyHooks } from './body/http';
import { reportFailure } from './body/rules';
import { createUndiciBodyCapture } from './body/undici';
import { warnOnce } from './env';

const HTTP = '@opentelemetry/instrumentation-http';
const UNDICI = '@opentelemetry/instrumentation-undici';
const HEADERS_ENV = 'OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_';
const SANITIZE_DEFAULT = [
  'authorization',
  'cookie',
  'set-cookie',
  'proxy-authorization',
  'x-api-key',
];

type Hook = ((this: unknown, ...args: any[]) => void) | undefined;

/** Runs our hook, then the caller's; a failure in ours never skips theirs. */
function chain(ours: (...args: any[]) => void, user: Hook) {
  return function (this: unknown, ...args: any[]) {
    try {
      ours(...args);
    } catch (err) {
      reportFailure(err);
    }
    user?.apply(this, args);
  };
}

type Entry = Record<string, any>;

/**
 * A copy of the caller's instrumentation config with the header lists from
 * `OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_*` and, when body capture is
 * on, the body hooks merged into the http and undici entries. The bundle
 * passes each entry to the instrumentation constructor as is, so this is the
 * only place to merge.
 */
export function composeInstrumentationConfig(
  user: InstrumentationConfigMap | undefined,
  bodies: boolean,
): { map: InstrumentationConfigMap; unsubscribe?: () => void } {
  const sanitize = new Set(
    (
      getStringListFromEnv(`${HEADERS_ENV}SANITIZE_FIELDS`) ?? SANITIZE_DEFAULT
    ).map(n => n.toLowerCase()),
  );
  const names = (list: string, code: string[] | undefined) => {
    const all = [
      ...(getStringListFromEnv(HEADERS_ENV + list) ?? []),
      ...(code ?? []),
    ];
    const kept = new Set<string>();
    for (const name of all.map(n => n.toLowerCase())) {
      if (!sanitize.has(name)) kept.add(name);
      else {
        warnOnce(
          `sanitized:${name}`,
          `header "${name}" is on the sanitize list and is not captured`,
        );
      }
    }
    return [...kept];
  };

  const http: Entry = (user?.[HTTP] as Entry | undefined) ?? {};
  const hh = http.headersToSpanAttributes;
  const httpEntry: Entry = {
    ...http,
    headersToSpanAttributes: {
      server: {
        requestHeaders: names('SERVER_REQUEST', hh?.server?.requestHeaders),
        responseHeaders: names('SERVER_RESPONSE', hh?.server?.responseHeaders),
      },
      client: {
        requestHeaders: names('CLIENT_REQUEST', hh?.client?.requestHeaders),
        responseHeaders: names('CLIENT_RESPONSE', hh?.client?.responseHeaders),
      },
    },
  };

  const undici: Entry = (user?.[UNDICI] as Entry | undefined) ?? {};
  const uh = undici.headersToSpanAttributes;
  const requestHeaders = names('CLIENT_REQUEST', uh?.requestHeaders);
  const responseHeaders = names('CLIENT_RESPONSE', uh?.responseHeaders);
  const undiciEntry: Entry = {
    ...undici,
    headersToSpanAttributes: {
      ...(requestHeaders.length > 0 ? { requestHeaders } : {}),
      ...(responseHeaders.length > 0 ? { responseHeaders } : {}),
    },
  };

  let unsubscribe: (() => void) | undefined;
  if (bodies) {
    const hooks = createHttpBodyHooks();
    httpEntry.requestHook = chain(hooks.requestHook, http.requestHook);
    httpEntry.responseHook = chain(hooks.responseHook, http.responseHook);
    httpEntry.applyCustomAttributesOnSpan = chain(
      span => hooks.finalize(span),
      http.applyCustomAttributesOnSpan,
    );
    const fetchBodies = createUndiciBodyCapture();
    if (fetchBodies !== undefined) {
      undiciEntry.requestHook = chain(
        fetchBodies.requestHook,
        undici.requestHook,
      );
      undiciEntry.responseHook = chain(
        fetchBodies.responseHook,
        undici.responseHook,
      );
      unsubscribe = fetchBodies.unsubscribe;
    }
  }

  return {
    map: { ...user, [HTTP]: httpEntry, [UNDICI]: undiciEntry },
    unsubscribe,
  };
}
