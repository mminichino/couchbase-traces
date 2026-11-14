import {
  mergeQueryAttribution,
  type QueryAttribution,
} from '@/query/attribution';

import {
  CouchbaseQueryError,
  deserialize,
  isSerializedQueryError,
} from './errors';
import { DEFAULT_MAX_BUFFERED_BYTES, fromFrames } from './resultset';
import { buildClientContextId } from './settings';
import type {
  CouchbaseFormat,
  CouchbaseQueryInputs,
  CouchbaseQueryRequestBody,
  CouchbaseResultSet,
  DataClient,
  Frame,
} from './types';

export const COUCHBASE_QUERY_PATH = '/api/couchbase/query';

/** Drops `undefined` values and sends `bigint` as a decimal string. */
export function normalizeParameters(
  params: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (params == null) return undefined;
  return Object.fromEntries(
    Object.entries(params)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, typeof v === 'bigint' ? v.toString() : v]),
  );
}

export function buildQueryRequestBody(
  inputs: CouchbaseQueryInputs<CouchbaseFormat>,
  queryId: string,
  attribution: QueryAttribution | undefined,
): CouchbaseQueryRequestBody {
  const maxExec = Number(inputs.query_settings?.max_execution_time);
  const timeoutMs =
    inputs.timeoutMs ??
    (Number.isFinite(maxExec) && maxExec > 0 ? maxExec * 1000 : undefined);
  return {
    connectionId: inputs.connectionId!,
    statement: inputs.query,
    parameters: normalizeParameters(inputs.query_params),
    format: inputs.format ?? 'JSON',
    columns: inputs.columns,
    columnTypes: inputs.columnTypes,
    timeoutMs,
    scanConsistency: inputs.scanConsistency,
    queryContext: inputs.queryContext,
    sourceSettings: inputs.sourceSettings,
    queryId,
    attribution,
  };
}

function parseFrame(line: string): Frame {
  // Frames are written by our own API route.
  const frame: Frame = JSON.parse(line);
  return frame;
}

/** Parses newline-delimited JSON frames from a response body. */
export async function* readNdjsonFrames(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Frame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (line !== '') yield parseFrame(line);
      }
    }
    buffer += decoder.decode();
    if (buffer.trim() !== '') yield parseFrame(buffer);
  } finally {
    try {
      await reader.cancel();
    } catch {
      // already closed
    }
    reader.releaseLock();
  }
}

function combineSignals(signals: (AbortSignal | undefined)[]): AbortSignal {
  const present = signals.filter((s): s is AbortSignal => s != null);
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(present);
  const controller = new AbortController();
  for (const s of present) {
    if (s.aborted) {
      controller.abort(s.reason);
      break;
    }
    s.addEventListener('abort', () => controller.abort(s.reason), {
      once: true,
    });
  }
  return controller.signal;
}

export class CouchbaseClient implements DataClient {
  readonly requestTimeoutMs: number = 3600000;
  private readonly attribution?: QueryAttribution;
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl?: string;
  private readonly headers?: () =>
    | Record<string, string>
    | Promise<Record<string, string>>;
  private readonly maxBufferedBytes: number;

  constructor(
    opts: {
      application?: string;
      requestTimeout?: number;
      attribution?: QueryAttribution;
      fetchImpl?: typeof fetch;
      /** Origin of the app API; defaults to window.origin + path under /api */
      baseUrl?: string;
      /** Extra headers (e.g. session cookie for the CLI). */
      headers?: () => Record<string, string> | Promise<Record<string, string>>;
      maxBufferedBytes?: number;
    } = {},
  ) {
    if (opts.requestTimeout != null && opts.requestTimeout >= 0) {
      this.requestTimeoutMs = opts.requestTimeout;
    }
    this.attribution = opts.attribution;
    this.fetchImpl = opts.fetchImpl ?? ((input, init) => fetch(input, init));
    this.baseUrl = opts.baseUrl;
    this.headers = opts.headers;
    this.maxBufferedBytes = opts.maxBufferedBytes ?? DEFAULT_MAX_BUFFERED_BYTES;
  }

  private url(): string {
    const origin =
      this.baseUrl ??
      (typeof window !== 'undefined' ? window.origin : undefined) ??
      '';
    // When baseUrl is the API root (…/api), append /couchbase/query only.
    if (origin.endsWith('/api') || origin.endsWith('/api/')) {
      return `${origin.replace(/\/+$/, '')}/couchbase/query`;
    }
    return `${origin}${COUCHBASE_QUERY_PATH}`;
  }

  async query<F extends CouchbaseFormat>(
    inputs: CouchbaseQueryInputs<F>,
  ): Promise<CouchbaseResultSet<F>> {
    const statement = inputs.query;
    if (!inputs.connectionId) {
      throw new CouchbaseQueryError(
        'CONNECTION_NOT_FOUND',
        'A connection id is required for Couchbase queries',
        statement,
      );
    }
    const format: CouchbaseFormat = inputs.format ?? 'JSON';
    const attribution = mergeQueryAttribution(
      this.attribution,
      inputs.attribution,
    );
    const queryId = buildClientContextId(inputs.queryId, attribution);
    const timeoutSignal = AbortSignal.timeout(this.requestTimeoutMs);
    const signal = combineSignals([inputs.abort_signal, timeoutSignal]);

    const abortError = () =>
      timeoutSignal.aborted && !inputs.abort_signal?.aborted
        ? new CouchbaseQueryError(
            'TIMEOUT',
            `Request timed out after ${this.requestTimeoutMs} ms`,
            statement,
          )
        : new CouchbaseQueryError('CANCELED', 'Query was canceled', statement);

    const extraHeaders =
      this.headers != null ? await Promise.resolve(this.headers()) : {};
    let res: Response;
    try {
      res = await this.fetchImpl(this.url(), {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...extraHeaders,
        },
        body: JSON.stringify(
          buildQueryRequestBody(inputs, queryId, attribution),
        ),
        signal,
      });
    } catch (e) {
      if (signal.aborted) throw abortError();
      throw new CouchbaseQueryError(
        'SERVICE_UNAVAILABLE',
        e instanceof Error ? e.message : String(e),
        statement,
        { cause: e },
      );
    }

    if (!res.ok) {
      let body: unknown;
      try {
        body = await res.json();
      } catch {
        body = undefined;
      }
      const err: unknown =
        body != null && typeof body === 'object'
          ? Reflect.get(body, 'error')
          : undefined;
      if (isSerializedQueryError(err)) throw deserialize(err, statement);
      throw new CouchbaseQueryError(
        'INTERNAL',
        typeof err === 'string' ? err : res.statusText || `HTTP ${res.status}`,
        statement,
      );
    }

    const responseBody = res.body;
    async function* frames(): AsyncGenerator<Frame> {
      try {
        if (responseBody == null) {
          const text = await res.text();
          for (const line of text.split('\n')) {
            if (line.trim() !== '') yield parseFrame(line);
          }
          return;
        }
        yield* readNdjsonFrames(responseBody);
      } catch (e) {
        if (signal.aborted) throw abortError();
        throw e;
      }
    }

    return fromFrames<F>(frames(), format, queryId, {
      maxBufferedBytes: this.maxBufferedBytes,
      statement,
    });
  }

  async close(): Promise<void> {
    // stateless: every query is its own request
  }
}
