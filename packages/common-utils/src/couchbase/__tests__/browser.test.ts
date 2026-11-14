import {
  buildQueryRequestBody,
  CouchbaseClient,
  normalizeParameters,
} from '@/couchbase/browser';
import { CouchbaseQueryError } from '@/couchbase/errors';
import type { Frame } from '@/couchbase/types';

function ndjsonResponse(frames: Frame[], chunkSize = 7): Response {
  const text = frames.map(f => JSON.stringify(f)).join('\n') + '\n';
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

const FRAMES: Frame[] = [
  { type: 'meta', meta: [{ name: 'n', type: 'Int64' }] },
  { type: 'rows', rows: [{ n: 1 }, { n: 2 }] },
  {
    type: 'end',
    rows: 2,
    statistics: { elapsed: 0, rows_read: 2, bytes_read: 10 },
  },
];

describe('CouchbaseClient', () => {
  it('posts the request body and parses NDJSON frames', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(ndjsonResponse(FRAMES));
    const client = new CouchbaseClient({
      fetchImpl,
      baseUrl: 'http://app.test',
      attribution: { surface: 'search' } as never,
    });
    expect(client.requestTimeoutMs).toBe(3600000);
    const rs = await client.query({
      query: 'SELECT n FROM x WHERE a = $p0',
      query_params: { p0: 1, dropped: undefined },
      connectionId: 'conn1',
      queryId: 'q1',
      format: 'JSON',
      columns: ['n'],
    });
    expect(rs.query_id).toBe('q1');
    const out = await rs.json();
    expect(out.data).toEqual([{ n: '1' }, { n: '2' }]);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://app.test/api/couchbase/query');
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(init.signal).toBeDefined();
    expect(JSON.parse(init.body)).toEqual({
      connectionId: 'conn1',
      statement: 'SELECT n FROM x WHERE a = $p0',
      parameters: { p0: 1 },
      format: 'JSON',
      columns: ['n'],
      queryId: 'q1',
      attribution: expect.objectContaining({ surface: 'search' }),
    });
  });

  it('requires a connection id', async () => {
    const client = new CouchbaseClient({ fetchImpl: jest.fn() });
    await expect(client.query({ query: 'SELECT 1' })).rejects.toMatchObject({
      code: 'CONNECTION_NOT_FOUND',
    });
  });

  it('throws the serialized error from a pre-stream 4xx', async () => {
    const fetchImpl = jest.fn().mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'STATEMENT_NOT_ALLOWED',
              message: 'no DML',
              sqlppCode: null,
            },
          }),
          { status: 400 },
        ),
    );
    const client = new CouchbaseClient({ fetchImpl, baseUrl: '' });
    const p = client.query({ query: 'DELETE FROM x', connectionId: 'c' });
    await expect(p).rejects.toBeInstanceOf(CouchbaseQueryError);
    await expect(
      client.query({ query: 'DELETE FROM x', connectionId: 'c' }),
    ).rejects.toMatchObject({
      code: 'STATEMENT_NOT_ALLOWED',
      message: 'no DML',
    });
  });

  it('throws INTERNAL for a non-JSON error response', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValue(
        new Response('bad gateway', { status: 502, statusText: 'Bad Gateway' }),
      );
    const client = new CouchbaseClient({ fetchImpl, baseUrl: '' });
    await expect(
      client.query({ query: 'SELECT 1', connectionId: 'c' }),
    ).rejects.toMatchObject({
      code: 'INTERNAL',
      message: 'Bad Gateway',
    });
  });

  it('maps an abort to CANCELED', async () => {
    const controller = new AbortController();
    const fetchImpl = jest.fn((_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
        );
      });
    });
    const client = new CouchbaseClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: '',
    });
    const p = client.query({
      query: 'SELECT 1',
      connectionId: 'c',
      abort_signal: controller.signal,
    });
    controller.abort();
    await expect(p).rejects.toMatchObject({ code: 'CANCELED' });
  });

  it('maps the request timeout to TIMEOUT', async () => {
    const fetchImpl = jest.fn((_url: string, init: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () =>
          reject(new Error('aborted')),
        );
      });
    });
    const client = new CouchbaseClient({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      baseUrl: '',
      requestTimeout: 10,
    });
    await expect(
      client.query({ query: 'SELECT 1', connectionId: 'c' }),
    ).rejects.toMatchObject({
      code: 'TIMEOUT',
    });
  });

  it('maps a network failure to SERVICE_UNAVAILABLE', async () => {
    const client = new CouchbaseClient({
      fetchImpl: jest.fn().mockRejectedValue(new TypeError('Failed to fetch')),
      baseUrl: '',
    });
    await expect(
      client.query({ query: 'SELECT 1', connectionId: 'c' }),
    ).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    });
  });

  it('streams JSONEachRow and surfaces mid-stream error frames', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(
      ndjsonResponse([
        FRAMES[0],
        FRAMES[1],
        {
          type: 'error',
          error: { code: 'TIMEOUT', message: 't', sqlppCode: null },
        },
      ]),
    );
    const client = new CouchbaseClient({ fetchImpl, baseUrl: '' });
    const rs = await client.query({
      query: 'SELECT 1',
      connectionId: 'c',
      format: 'JSONEachRow',
    });
    const reader = rs.stream().getReader();
    const first = await reader.read();
    expect(first.value?.map(r => r.text)).toEqual(['{"n":"1"}', '{"n":"2"}']);
    await expect(reader.read()).rejects.toMatchObject({ code: 'TIMEOUT' });
    await client.close();
  });
});

describe('request helpers', () => {
  it('normalizeParameters drops undefined and stringifies bigint', () => {
    expect(normalizeParameters(undefined)).toBeUndefined();
    expect(
      normalizeParameters({ a: undefined, b: BigInt(10), c: null }),
    ).toEqual({ b: '10', c: null });
  });

  it('buildQueryRequestBody maps max_execution_time to timeoutMs', () => {
    expect(
      buildQueryRequestBody(
        {
          query: 'SELECT 1',
          connectionId: 'c',
          query_settings: { max_execution_time: 5 },
        },
        'q',
        undefined,
      ).timeoutMs,
    ).toBe(5000);
  });
});
