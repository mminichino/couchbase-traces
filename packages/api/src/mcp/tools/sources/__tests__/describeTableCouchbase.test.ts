// D4: cbt_describe_table on an empty collection describes it instead of
// reporting it missing; a collection that does not exist is still a "not
// found" user error, as upstream. Q25: an empty OTel collection reports its
// declared schema, as upstream DESCRIBE TABLE does for a table with no rows.

const mockGetColumns = jest.fn();
const mockListKeyspaces = jest.fn();

jest.mock('@couchbase-traces/common-utils/dist/dataLayer', () => ({
  getMetadata: () => ({
    getColumns: (...args: unknown[]) => mockGetColumns(...args),
    listKeyspaces: (...args: unknown[]) => mockListKeyspaces(...args),
  }),
}));

import { CouchbaseQueryError } from '@couchbase-traces/common-utils/dist/couchbase/errors';

import { describeCouchbaseTable } from '@/mcp/tools/sources/describeTableCouchbase';
import { DataClient } from '@/query';

// Never queried: sampleRows is 0 and metadata is mocked.
const ctx = {
  dataClient: new DataClient({ requestTimeout: 1000 }),
  connectionId: 'conn-1',
  signal: new AbortController().signal,
};
const input = {
  connectionId: 'conn-1',
  database: 'otel',
  table: 'otel_logs',
  sampleRows: 0,
  limit: 50,
  teamId: 'team-1',
};

const otelLogs = { bucket: 'otel', scope: 'default', collection: 'otel_logs' };

beforeEach(() => jest.clearAllMocks());

describe('describeCouchbaseTable', () => {
  it('describes an empty OTel collection with its declared columns', async () => {
    mockGetColumns.mockResolvedValue([]);
    mockListKeyspaces.mockResolvedValue([otelLogs]);

    const result = await describeCouchbaseTable(ctx, input);

    expect(result.isError).toBeFalsy();
    const output = JSON.parse(result.content[0].text);
    expect(output.table).toMatchObject({
      database: 'otel',
      scope: 'default',
      name: 'otel_logs',
    });
    expect(output.columns).toEqual(
      expect.arrayContaining([
        { name: 'Timestamp', type: 'DateTime64(9)', jsType: 'date' },
        { name: 'Body', type: 'String', jsType: 'string' },
        {
          name: 'LogAttributes',
          type: 'Map(LowCardinality(String), String)',
          jsType: 'map',
        },
      ]),
    );
    expect(output.note).toMatch(/declared OTel schema/i);
  });

  it('describes an empty non-OTel collection with no columns', async () => {
    mockGetColumns.mockResolvedValue([]);
    mockListKeyspaces.mockResolvedValue([
      { ...otelLogs, collection: 'my_events' },
    ]);

    const result = await describeCouchbaseTable(ctx, {
      ...input,
      table: 'my_events',
    });

    expect(result.isError).toBeFalsy();
    const output = JSON.parse(result.content[0].text);
    expect(output.columns).toEqual([]);
    expect(output.note).toMatch(/no documents/i);
  });

  it('reports a collection that does not exist', async () => {
    mockGetColumns.mockResolvedValue([]);
    mockListKeyspaces.mockResolvedValue([
      { ...otelLogs, collection: 'otel_traces' },
    ]);

    const result = await describeCouchbaseTable(ctx, input);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/);
  });

  it('treats an injection-style table name as a name, not SQL', async () => {
    mockGetColumns.mockResolvedValue([]);
    mockListKeyspaces.mockResolvedValue([otelLogs]);

    const result = await describeCouchbaseTable(ctx, {
      ...input,
      table: "events' OR '1'='1",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/);
    expect(mockGetColumns).toHaveBeenCalledWith(
      expect.objectContaining({ tableName: "events' OR '1'='1" }),
    );
  });

  it('reports a missing keyspace error from INFER as not found', async () => {
    mockGetColumns.mockRejectedValue(
      new CouchbaseQueryError(
        'KEYSPACE_NOT_FOUND',
        'Keyspace not found',
        'INFER',
        {
          sqlppCode: 12003,
        },
      ),
    );

    const result = await describeCouchbaseTable(ctx, input);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/not found/);
    expect(mockListKeyspaces).not.toHaveBeenCalled();
  });

  it('describes a populated collection without listing keyspaces', async () => {
    mockGetColumns.mockResolvedValue([{ name: 'Body', type: 'String' }]);

    const result = await describeCouchbaseTable(ctx, input);

    expect(result.isError).toBeFalsy();
    const output = JSON.parse(result.content[0].text);
    expect(output.columns).toEqual([
      { name: 'Body', type: 'String', jsType: 'string' },
    ]);
    expect(output.note).toBeUndefined();
    expect(mockListKeyspaces).not.toHaveBeenCalled();
  });
});
