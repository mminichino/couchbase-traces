import { SourceKind } from '@couchbase-traces/common-utils/dist/types';

import { computeAliasWithClauses } from '@/tasks/checkAlerts';
import { fetchSampleLines } from '@/tasks/checkAlerts/template';

// D6: a Lucene filter makes the SQL++ renderer read the source's columns, and
// every Couchbase read needs the source's connection id. The alert task used
// to render these configs with `connection: ''` (a ClickHouse-era shortcut:
// that client was bound to one server), so the column lookup threw "A
// connection id is required for Couchbase queries".

const CONNECTION = 'conn-d6';

const source: any = {
  id: 'source-d6',
  kind: SourceKind.Log,
  team: 'team-d6',
  name: 'Logs',
  connection: CONNECTION,
  from: { databaseName: 'cbt_otel', scopeName: 'default', tableName: 'logs' },
  timestampValueExpression: 'Timestamp',
  implicitColumnExpression: 'Body',
  defaultTableSelectExpression: 'Timestamp, ServiceName, Body',
};

const savedSearch: any = {
  id: 'search-d6',
  select: 'Body AS body, ServiceName AS svc',
  where: 'svc:api',
  whereLanguage: 'lucene',
  orderBy: '',
  filters: [],
};

const stubMetadata = () => {
  const connectionIds: unknown[] = [];
  const record =
    <T>(value: T) =>
    async (args: { connectionId?: string }) => {
      connectionIds.push(args?.connectionId);
      if (!args?.connectionId) {
        throw new Error('A connection id is required for Couchbase queries');
      }
      return value;
    };
  const metadata: any = {
    getColumns: record([
      { name: 'Timestamp', type: 'string' },
      { name: 'ServiceName', type: 'string' },
      { name: 'Body', type: 'string' },
    ]),
    getColumn: record(undefined),
    getAllFields: record([]),
    getJSONKeys: record([]),
    getKeyValues: record([]),
    listKeyspaces: record([]),
  };
  return { metadata, connectionIds };
};

describe('alert queries pass the source connection to metadata', () => {
  it('computeAliasWithClauses reads columns with the source connection', async () => {
    const { metadata, connectionIds } = stubMetadata();

    const withClauses = await computeAliasWithClauses(
      savedSearch,
      source,
      metadata,
    );

    expect(withClauses?.map(w => w.name).sort()).toEqual(['body', 'svc']);
    expect(connectionIds.length).toBeGreaterThan(0);
    expect(new Set(connectionIds)).toEqual(new Set([CONNECTION]));
  });

  it('fetchSampleLines queries CSV lines with the source connection', async () => {
    const { metadata, connectionIds } = stubMetadata();
    const queries: { connectionId?: string; format?: string }[] = [];
    const dataClient: any = {
      query: async (inputs: { connectionId?: string; format?: string }) => {
        queries.push(inputs);
        return { text: async () => 'hello,api\n' };
      },
    };

    const lines = await fetchSampleLines({
      dataClient,
      metadata,
      savedSearch,
      source,
      startTime: new Date('2026-01-01T00:00:00Z'),
      endTime: new Date('2026-01-01T00:05:00Z'),
    });

    expect(lines).toBe('hello,api\n');
    expect(new Set(connectionIds)).toEqual(new Set([CONNECTION]));
    expect(queries.map(q => [q.connectionId, q.format])).toEqual([
      [CONNECTION, 'CSV'],
    ]);
  });
});
