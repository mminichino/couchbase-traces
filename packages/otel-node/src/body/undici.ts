import { subscribe, unsubscribe } from 'node:diagnostics_channel';

import type { Span } from '@opentelemetry/api';

import { warnOnce } from '../env';
import {
  BodyCapture,
  type BodyMeta,
  headerMap,
  reportFailure,
  responseHasNoBody,
} from './rules';

type Side = { capture: BodyCapture; meta: Omit<BodyMeta, 'complete'> };

type Exchange = { span: Span; request: Side; response?: Side };

type UndiciRequest = {
  method?: string;
  headers?: unknown;
  contentLength?: number | string | null;
};

type UndiciResponse = { statusCode?: number; headers?: unknown };

const side = (
  headers: Map<string, string>,
  contentLength: BodyMeta['contentLength'],
): Side => ({
  capture: new BodyCapture(),
  meta: {
    contentType: headers.get('content-type'),
    contentEncoding: headers.get('content-encoding'),
    contentLength,
  },
});

/** Node bundles undici 7.11, which publishes body channels, from 24.4. */
export function hasBodyChannels(): boolean {
  const [major = 0, minor = 0] = (process.versions['undici'] ?? '0')
    .split('.')
    .map(Number);
  return major > 7 || (major === 7 && minor >= 11);
}

/**
 * Captures fetch bodies from undici's diagnostics channels. Must run before
 * `instrumentation-undici` is constructed: that instrumentation ends the span
 * in its own trailers and error subscribers, and subscribers run in order, so
 * ours must come first to write while the span is open.
 *
 * @returns The hooks, or `undefined` (with one warning) on older Node.
 */
export function createUndiciBodyCapture() {
  if (!hasBodyChannels()) {
    warnOnce(
      'undici-bodies',
      `fetch bodies are captured from Node.js 24.4; ${process.version} has no undici body channels`,
    );
    return undefined;
  }
  const exchanges = new WeakMap<object, Exchange>();
  const listeners: [string, (message: unknown) => void][] = [];
  const listen = (
    name: string,
    handle: (request: object, message: Record<string, unknown>) => void,
  ) => {
    const listener = (message: unknown) => {
      try {
        const m = message as Record<string, unknown>;
        handle(m.request as object, m);
      } catch (err) {
        reportFailure(err);
      }
    };
    subscribe(name, listener);
    listeners.push([name, listener]);
  };
  const chunk =
    (direction: 'request' | 'response') =>
    (request: object, message: Record<string, unknown>) => {
      exchanges.get(request)?.[direction]?.capture.add(message.chunk);
    };
  const finish = (cut: boolean) => (request: object) => {
    const ex = exchanges.get(request);
    exchanges.delete(request);
    if (!ex?.span.isRecording()) return;
    for (const direction of ['request', 'response'] as const) {
      const s = ex[direction];
      if (s !== undefined) {
        ex.span.setAttributes(
          s.capture.attributes(direction, { ...s.meta, complete: !cut }),
        );
      }
    }
  };
  listen('undici:request:bodyChunkSent', chunk('request'));
  listen('undici:request:bodyChunkReceived', chunk('response'));
  listen('undici:request:trailers', finish(false));
  listen('undici:request:error', finish(true));

  return {
    requestHook(span: Span, request: UndiciRequest) {
      if (!span.isRecording()) return;
      exchanges.set(request, {
        span,
        request: side(headerMap(request.headers), request.contentLength),
      });
    },
    responseHook(
      _span: Span,
      {
        request,
        response,
      }: { request: UndiciRequest; response: UndiciResponse },
    ) {
      const ex = exchanges.get(request);
      if (
        ex === undefined ||
        responseHasNoBody(request.method, response.statusCode)
      ) {
        return;
      }
      const headers = headerMap(response.headers);
      ex.response = side(headers, headers.get('content-length'));
    },
    unsubscribe() {
      for (const [name, listener] of listeners) unsubscribe(name, listener);
    },
  };
}
