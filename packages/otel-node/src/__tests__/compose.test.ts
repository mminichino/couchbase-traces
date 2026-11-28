import { IncomingMessage } from 'node:http';
import { Socket } from 'node:net';

import { INVALID_SPAN_CONTEXT, trace } from '@opentelemetry/api';

import { composeInstrumentationConfig } from '../compose';

const HTTP = '@opentelemetry/instrumentation-http';
const UNDICI = '@opentelemetry/instrumentation-undici';

describe('composeInstrumentationConfig', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('merges header lists from the environment and drops sanitized ones', () => {
    process.env.OTEL_INSTRUMENTATION_HTTP_CAPTURE_HEADERS_SERVER_REQUEST =
      'X-Request-Id,Authorization';
    const { map } = composeInstrumentationConfig(
      {
        [HTTP]: {
          headersToSpanAttributes: { server: { requestHeaders: ['x-team'] } },
        },
      },
      false,
    );
    expect(map[HTTP]?.headersToSpanAttributes?.server?.requestHeaders).toEqual([
      'x-request-id',
      'x-team',
    ]);
    expect(map[UNDICI]?.headersToSpanAttributes).toEqual({});
  });

  it('keeps the caller entries and hooks, running ours first', () => {
    const calls: string[] = [];
    const ignore = () => true;
    const { map } = composeInstrumentationConfig(
      {
        [HTTP]: {
          ignoreIncomingRequestHook: ignore,
          requestHook: () => calls.push('user'),
        },
        '@opentelemetry/instrumentation-fs': { enabled: false },
      },
      true,
    );
    const http = map[HTTP];
    if (http?.requestHook === undefined) throw new Error('no request hook');
    expect(http.ignoreIncomingRequestHook).toBe(ignore);
    expect(map['@opentelemetry/instrumentation-fs']).toEqual({
      enabled: false,
    });
    const request = new IncomingMessage(new Socket());
    request.method = 'GET';
    http.requestHook(trace.wrapSpanContext(INVALID_SPAN_CONTEXT), request);
    expect(calls).toEqual(['user']);
    expect(typeof http.applyCustomAttributesOnSpan).toBe('function');
  });

  it('adds no body hooks when capture is off', () => {
    const { map, unsubscribe } = composeInstrumentationConfig(undefined, false);
    expect(map[HTTP]?.requestHook).toBeUndefined();
    expect(unsubscribe).toBeUndefined();
  });
});
