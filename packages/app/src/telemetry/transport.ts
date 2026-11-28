/**
 * Request transport shared by the browser telemetry exporters.
 *
 * Ported from @clickhouse/clickstack-browser 1.2.1 (Apache-2.0), see
 * NOTICE.
 */
import { context, diag } from '@opentelemetry/api';
import {
  type ExportResult,
  ExportResultCode,
  suppressTracing,
} from '@opentelemetry/core';

const TIMEOUT_MS = 10_000;
// Chromium's keepalive budget is 64 KiB per page and a handful of requests.
const KEEPALIVE_MAX_BYTES = 61_440;
const KEEPALIVE_MAX_REQUESTS = 9;

let keepaliveBytes = 0;
let keepaliveRequests = 0;

const canGzip = () => typeof CompressionStream === 'function';

/**
 * The same bytes typed as backed by an `ArrayBuffer`, which `fetch` and
 * `CompressionStream` require; copies only a `SharedArrayBuffer` view.
 */
function ownBytes(data: Uint8Array): Uint8Array<ArrayBuffer> {
  return data.buffer instanceof ArrayBuffer
    ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    : new Uint8Array(data);
}

/**
 * Gzips `data` with the browser's `CompressionStream`, or returns it
 * unchanged where there is none. Reads the output with a reader loop: in
 * Chromium, `new Response(stream).arrayBuffer()` does not finish while the
 * page is being hidden, which is exactly when the final batch is sent.
 */
export async function compress(data: Uint8Array): Promise<Uint8Array> {
  if (!canGzip()) return data;
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  const written = writer.write(ownBytes(data)).then(() => writer.close());
  const reader = stream.readable.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    parts.push(read.value);
    size += read.value.byteLength;
  }
  await written;
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

/**
 * Posts an OTLP body outside any trace and reads the response.
 *
 * Keepalive is used when asked for and the page-wide budget allows. A
 * keepalive request the browser rejects is sent once more without it.
 * Chromium counts a keepalive request against the budget until its response
 * body is read, so the budget is released only then. Requests are aborted
 * after 10 s.
 */
export async function post(
  url: string,
  headers: Record<string, string>,
  body: Uint8Array,
  outlivePage: boolean,
): Promise<Response> {
  const keepalive =
    outlivePage &&
    keepaliveBytes + body.byteLength <= KEEPALIVE_MAX_BYTES &&
    keepaliveRequests < KEEPALIVE_MAX_REQUESTS;
  if (keepalive) {
    keepaliveBytes += body.byteLength;
    keepaliveRequests++;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const send = (withKeepalive: boolean) =>
    context.with(suppressTracing(context.active()), () =>
      fetch(url, {
        method: 'POST',
        headers: canGzip()
          ? { ...headers, 'content-encoding': 'gzip' }
          : headers,
        body: ownBytes(body),
        keepalive: withKeepalive,
        signal: controller.signal,
      }),
    );
  try {
    const response = await send(keepalive).catch((error: unknown) => {
      if (keepalive && error instanceof TypeError) return send(false);
      throw error;
    });
    await response.arrayBuffer();
    return response;
  } finally {
    clearTimeout(timer);
    if (keepalive) {
      keepaliveBytes -= body.byteLength;
      keepaliveRequests--;
    }
  }
}

/** Logs the first failure of one exporter and stays quiet afterwards. */
export function onceWarner(what: string, url: string) {
  let warned = false;
  return (reason: unknown) => {
    if (warned) return;
    warned = true;
    diag.warn(
      `couchbase-traces browser telemetry: ${what} to ${new URL(url).host} failed; later failures are not logged`,
      reason,
    );
  };
}

/**
 * The export bookkeeping both exporters share: sends run concurrently, flush
 * waits for all of them, and every export reports success because telemetry
 * must never surface as an app error.
 */
export abstract class FireAndForgetExporter<T> {
  readonly #pending = new Set<Promise<void>>();
  protected readonly warn: (reason: unknown) => void;
  protected readonly url: string;
  protected readonly headers: Record<string, string>;

  constructor(what: string, url: string, apiKey: string | undefined) {
    this.url = url;
    this.headers = {
      ...(apiKey ? { authorization: apiKey } : {}),
      'content-type': 'application/json',
    };
    this.warn = onceWarner(what, url);
  }

  protected abstract send(items: T[]): Promise<void>;

  export(items: T[], resultCallback: (result: ExportResult) => void): void {
    const sending: Promise<void> = this.send(items)
      .catch(this.warn)
      .then(() => {
        this.#pending.delete(sending);
        resultCallback({ code: ExportResultCode.SUCCESS });
      });
    this.#pending.add(sending);
  }

  async forceFlush(): Promise<void> {
    await Promise.all(this.#pending);
  }

  shutdown(): Promise<void> {
    return this.forceFlush();
  }
}
