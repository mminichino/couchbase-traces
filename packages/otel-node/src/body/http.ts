import { errorMonitor } from 'node:events';
import type {
  ClientRequest,
  IncomingMessage,
  OutgoingHttpHeaders,
  ServerResponse,
} from 'node:http';

import type { Span } from '@opentelemetry/api';

import {
  BodyCapture,
  type BodyMeta,
  headerMap,
  reportFailure,
  responseHasNoBody,
} from './rules';

type Message = ClientRequest | IncomingMessage | ServerResponse;

type Observed = { capture: BodyCapture; meta: () => BodyMeta };

type Exchange = {
  method: string | undefined;
  request: Observed;
  response?: Observed;
  status?: () => number | undefined;
};

function isIncoming(message: Message): message is IncomingMessage {
  return !('getHeader' in message);
}

/** Copies a message's body as it is read or written. */
function observe(message: Message): Observed {
  const capture = new BodyCapture();
  const copy = (chunk: unknown, encoding: unknown) => {
    try {
      capture.add(chunk, encoding);
    } catch (err) {
      reportFailure(err);
    }
  };

  if (isIncoming(message)) {
    const { headers } = message;
    const meta = {
      contentType: headers['content-type'],
      contentEncoding: headers['content-encoding'],
      contentLength: headers['content-length'],
    };
    // Wrapping emit sees `data` without adding a listener, which would
    // switch the stream to flowing mode before the app reads it.
    const emit = message.emit.bind(message);
    message.emit = ((event: string | symbol, ...args: unknown[]) => {
      if (event === 'data') copy(args[0], message.readableEncoding);
      return emit(event, ...args);
    }) as typeof message.emit;
    return { capture, meta: () => ({ ...meta, complete: message.complete }) };
  }

  const wrap =
    <F extends (...args: any[]) => unknown>(original: F) =>
    (...args: Parameters<F>) => {
      const ended = message.writableEnded;
      const result = Reflect.apply(original, message, args);
      if (!ended && typeof args[0] !== 'function') copy(args[0], args[1]);
      return result;
    };
  message.write = wrap(message.write.bind(message)) as typeof message.write;
  message.end = wrap(message.end.bind(message)) as typeof message.end;

  // Headers passed to writeHead are not visible through getHeader.
  let written = new Map<string, string>();
  if ('writeHead' in message) {
    const response = message;
    const writeHead = response.writeHead.bind(response);
    response.writeHead = ((...args: unknown[]) => {
      const result = (writeHead as (...a: unknown[]) => ServerResponse)(
        ...args,
      );
      try {
        const raw = args
          .slice(1)
          .find(a => typeof a === 'object' && a !== null) as
          | OutgoingHttpHeaders
          | unknown[]
          | undefined;
        const list = Array.isArray(raw)
          ? raw.flat()
          : Object.entries(raw ?? {}).flat();
        if (list.length > 0) written = headerMap(list);
      } catch (err) {
        reportFailure(err);
      }
      return result;
    }) as typeof response.writeHead;
  }
  const outgoing = message;
  const header = (name: string) =>
    (outgoing.getHeader(name) as BodyMeta['contentType']) ?? written.get(name);
  return {
    capture,
    meta: () => ({
      contentType: header('content-type'),
      contentEncoding: header('content-encoding'),
      contentLength: header('content-length'),
      complete: outgoing.writableEnded,
    }),
  };
}

/** The `instrumentation-http` hooks that record bodies on `node:http` spans. */
export function createHttpBodyHooks() {
  const exchanges = new WeakMap<Span, Exchange>();

  const finalize = (span: Span) => {
    try {
      const ex = exchanges.get(span);
      exchanges.delete(span);
      if (ex === undefined || !span.isRecording()) return;
      span.setAttributes(
        ex.request.capture.attributes('request', ex.request.meta()),
      );
      if (
        ex.response !== undefined &&
        !responseHasNoBody(ex.method, ex.status?.())
      ) {
        span.setAttributes(
          ex.response.capture.attributes('response', ex.response.meta()),
        );
      }
    } catch (err) {
      reportFailure(err);
    }
  };

  return {
    requestHook(span: Span, request: ClientRequest | IncomingMessage) {
      if (!span.isRecording()) return;
      exchanges.set(span, {
        method: request.method,
        request: observe(request),
      });
      // Outgoing requests can fail or close without a response.
      if (!isIncoming(request)) {
        const done = () => finalize(span);
        request.on(errorMonitor, done).on('close', done);
      }
    },
    responseHook(span: Span, response: IncomingMessage | ServerResponse) {
      const ex = exchanges.get(span);
      if (ex === undefined) return;
      ex.response = observe(response);
      ex.status = () => response.statusCode;
      if (!isIncoming(response)) {
        response.on(errorMonitor, () => finalize(span));
      }
    },
    finalize,
  };
}
