/**
 * D5: the onboarding checklist's "Add data" step asks whether any enabled
 * source collection has documents. Upstream summed ClickHouse
 * `system.tables.total_rows`; Couchbase has no such table, so each existing
 * collection gets one unfiltered COUNT(*).
 */
import {
  documentCountStatement,
  hasDocuments,
} from '@/couchbase/documentPresence';
import { CouchbaseQueryError } from '@/couchbase/errors';

type Call = { query: string; params: unknown; connectionId?: string };

function client(answer: (query: string) => unknown[]) {
  const calls: Call[] = [];
  return {
    calls,
    data: {
      async query(inputs: {
        query: string;
        query_params?: unknown;
        connectionId?: string;
      }) {
        calls.push({
          query: inputs.query,
          params: inputs.query_params,
          connectionId: inputs.connectionId,
        });
        const rows = answer(inputs.query);
        return { json: async () => ({ data: rows }) };
      },
    },
  };
}

const LISTING = [
  ['otel', 'default', 'otel_logs'],
  ['otel', 'default', 'otel_traces'],
];
const isListing = (q: string) => q.includes('system:all_keyspaces');

const logs = { databaseName: 'otel', tableName: 'otel_logs' };
const traces = { databaseName: 'otel', tableName: 'otel_traces' };

describe('documentCountStatement', () => {
  it('counts a quoted keyspace with no predicate', () => {
    const q = documentCountStatement({
      bucket: 'otel',
      scope: 'default',
      collection: 'otel_logs',
    });
    expect(q.statement).toBe(
      'SELECT RAW COUNT(*) FROM `otel`.`default`.`otel_logs`',
    );
    expect(q.parameters).toEqual({});
  });

  it('rejects an identifier containing a backtick', () => {
    expect(() =>
      documentCountStatement({
        bucket: 'otel',
        scope: 'default',
        collection: 'x` UNION SELECT 1 --',
      }),
    ).toThrow();
  });
});

describe('hasDocuments', () => {
  it('is false with no keyspaces, without querying', async () => {
    const c = client(() => []);
    await expect(
      hasDocuments(c.data, { connectionId: 'c1', keyspaces: [] }),
    ).resolves.toBe(false);
    expect(c.calls).toHaveLength(0);
  });

  it('is true when a source collection has documents', async () => {
    const c = client(q => (isListing(q) ? LISTING : ['12']));
    await expect(
      hasDocuments(c.data, { connectionId: 'c1', keyspaces: [logs] }),
    ).resolves.toBe(true);
    expect(c.calls.every(call => call.connectionId === 'c1')).toBe(true);
    // The listing filters by named parameters, never by inlined values.
    expect(c.calls[0].query).not.toMatch(/'default'|'_system'/);
    expect(c.calls[0].params).toEqual(expect.any(Object));
  });

  it('is false when every collection is empty', async () => {
    const c = client(q => (isListing(q) ? LISTING : ['0']));
    await expect(
      hasDocuments(c.data, { connectionId: 'c1', keyspaces: [logs, traces] }),
    ).resolves.toBe(false);
    expect(c.calls.filter(call => !isListing(call.query))).toHaveLength(2);
  });

  it('stops at the first collection with documents', async () => {
    const c = client(q => (isListing(q) ? LISTING : ['5']));
    await hasDocuments(c.data, {
      connectionId: 'c1',
      keyspaces: [logs, traces],
    });
    expect(c.calls.filter(call => !isListing(call.query))).toHaveLength(1);
  });

  it('counts each keyspace once and defaults the scope', async () => {
    const c = client(q => (isListing(q) ? LISTING : ['0']));
    await hasDocuments(c.data, {
      connectionId: 'c1',
      keyspaces: [logs, { ...logs, scopeName: 'default' }],
    });
    const counts = c.calls.filter(call => !isListing(call.query));
    expect(counts.map(call => call.query)).toEqual([
      'SELECT RAW COUNT(*) FROM `otel`.`default`.`otel_logs`',
    ]);
  });

  it('skips collections that do not exist instead of failing', async () => {
    const c = client(q => (isListing(q) ? LISTING : ['3']));
    await expect(
      hasDocuments(c.data, {
        connectionId: 'c1',
        keyspaces: [{ databaseName: 'otel', tableName: 'nope' }],
      }),
    ).resolves.toBe(false);
    expect(c.calls).toHaveLength(1);
  });

  it('treats a collection dropped after listing as empty', async () => {
    const c = client(q => {
      if (isListing(q)) return LISTING;
      throw new CouchbaseQueryError('KEYSPACE_NOT_FOUND', 'gone', q, {
        sqlppCode: 12003,
      });
    });
    await expect(
      hasDocuments(c.data, { connectionId: 'c1', keyspaces: [logs] }),
    ).resolves.toBe(false);
  });

  it('propagates other errors', async () => {
    const c = client(q => {
      if (isListing(q)) return LISTING;
      throw new CouchbaseQueryError('TIMEOUT', 'slow', q, { sqlppCode: null });
    });
    await expect(
      hasDocuments(c.data, { connectionId: 'c1', keyspaces: [logs] }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('reads RAW rows wrapped as { value } by the data client', async () => {
    const c = client(q =>
      isListing(q) ? LISTING.map(value => ({ value })) : [{ value: '1' }],
    );
    await expect(
      hasDocuments(c.data, { connectionId: 'c1', keyspaces: [logs] }),
    ).resolves.toBe(true);
  });

  it('reads numeric counts as well as Int64 strings', async () => {
    const c = client(q => (isListing(q) ? LISTING : [7]));
    await expect(
      hasDocuments(c.data, { connectionId: 'c1', keyspaces: [logs] }),
    ).resolves.toBe(true);
  });
});
