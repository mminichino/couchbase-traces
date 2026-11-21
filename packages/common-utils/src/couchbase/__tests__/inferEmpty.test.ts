/**
 * D4: INFER on an empty collection fails with 7014 "No documents found,
 * unable to infer schema". Upstream DESCRIBE TABLE on an empty table is not an
 * error, so every metadata caller (describe tools, alerts, field sidebar)
 * gets an empty schema instead.
 */
import { COLUMNS_CACHE_TTL_MS, MetadataCache } from '@/core/metadata';
import {
  CouchbaseQueryError,
  INFER_NO_DOCUMENTS,
  isEmptyInferError,
} from '@/couchbase/errors';
import { EMPTY_COLUMNS_CACHE_TTL_MS, Metadata } from '@/couchbase/metadata';

const EMPTY_MESSAGE = 'No documents found, unable to infer schema';

const emptyInfer = (statement: string) =>
  new CouchbaseQueryError('INTERNAL', EMPTY_MESSAGE, statement, {
    sqlppCode: INFER_NO_DOCUMENTS,
  });

function metadata(onQuery: (query: string) => unknown[]) {
  const queries: string[] = [];
  const data = {
    requestTimeoutMs: 1000,
    async query({ query }: { query: string }) {
      queries.push(query);
      const rows = onQuery(query);
      return {
        query_id: 'q',
        json: async () => ({ data: rows, meta: [], rows: 0, statistics: {} }),
        text: async () => '',
        stream: () => new ReadableStream(),
        close: () => undefined,
      };
    },
    close: async () => undefined,
  };
  return { queries, meta: new Metadata(data as never, new MetadataCache()) };
}

const tc = {
  connectionId: 'c',
  databaseName: 'otel',
  scopeName: 'default',
  tableName: 'otel_logs',
};

describe('isEmptyInferError', () => {
  it('matches INFER error 7014', () => {
    expect(isEmptyInferError(emptyInfer('INFER x'))).toBe(true);
  });

  it('matches the message when the code was lost in transit', () => {
    const e = new CouchbaseQueryError('INTERNAL', EMPTY_MESSAGE, 'INFER x', {
      sqlppCode: null,
    });
    expect(isEmptyInferError(e)).toBe(true);
  });

  it.each([
    ['a missing keyspace', 'KEYSPACE_NOT_FOUND', 'Keyspace not found', 12003],
    ['a timeout', 'TIMEOUT', 'Timeout', null],
    ['another INTERNAL error', 'INTERNAL', 'Internal error', 5000],
  ] as const)('does not match %s', (_label, code, message, sqlppCode) => {
    const e = new CouchbaseQueryError(code, message, 'INFER x', { sqlppCode });
    expect(isEmptyInferError(e)).toBe(false);
  });

  it('does not match non-query errors', () => {
    expect(isEmptyInferError(new Error(EMPTY_MESSAGE))).toBe(false);
    expect(isEmptyInferError(undefined)).toBe(false);
  });
});

describe('Metadata on an empty collection', () => {
  const empty = () =>
    metadata(query => {
      if (query.startsWith('INFER')) throw emptyInfer(query);
      return [];
    });

  it('getColumns returns no columns instead of throwing', async () => {
    const { meta, queries } = empty();
    await expect(meta.getColumns(tc)).resolves.toEqual([]);
    // INFER, then the document sample fallback.
    expect(queries).toHaveLength(2);
  });

  it('getAllFields and getJSONKeys return nothing', async () => {
    const { meta } = empty();
    await expect(meta.getAllFields(tc)).resolves.toEqual([]);
    await expect(
      meta.getJSONKeys({ ...tc, column: 'LogAttributes' }),
    ).resolves.toEqual([]);
  });

  it('reads fields from documents written after INFER sampled', async () => {
    const { meta } = metadata(query => {
      if (query.startsWith('INFER')) throw emptyInfer(query);
      return [{ d: { ServiceName: 'api', Duration: 5 } }];
    });
    const columns = await meta.getColumns(tc);
    expect(columns.map(c => [c.name, c.type])).toEqual([
      ['ServiceName', 'String'],
      ['Duration', 'Int64'],
    ]);
  });

  it('re-reads an empty schema soon, so new documents show up', async () => {
    let docs: unknown[] = [];
    const { meta } = metadata(query => {
      if (query.startsWith('INFER')) throw emptyInfer(query);
      return docs;
    });
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      await expect(meta.getColumns(tc)).resolves.toEqual([]);
      docs = [{ d: { ServiceName: 'api' } }];
      // Within the short empty-schema TTL the cached answer stands...
      now.mockReturnValue(1_000_000 + EMPTY_COLUMNS_CACHE_TTL_MS - 1);
      await expect(meta.getColumns(tc)).resolves.toEqual([]);
      // ...and well before the 5-minute column TTL it is fetched again.
      now.mockReturnValue(1_000_000 + EMPTY_COLUMNS_CACHE_TTL_MS);
      const columns = await meta.getColumns(tc);
      expect(columns.map(c => c.name)).toEqual(['ServiceName']);
      expect(EMPTY_COLUMNS_CACHE_TTL_MS).toBeLessThan(COLUMNS_CACHE_TTL_MS);
    } finally {
      now.mockRestore();
    }
  });

  it('still throws other INFER errors', async () => {
    const { meta } = metadata(query => {
      throw new CouchbaseQueryError('KEYSPACE_NOT_FOUND', 'nope', query, {
        sqlppCode: 12003,
      });
    });
    await expect(meta.getColumns(tc)).rejects.toMatchObject({
      code: 'KEYSPACE_NOT_FOUND',
    });
  });
});
