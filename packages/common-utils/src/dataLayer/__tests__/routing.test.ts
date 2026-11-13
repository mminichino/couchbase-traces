import type { BaseResultSet } from '@/clickhouse';
import { ClickhouseClient } from '@/clickhouse/node';
import { Metadata } from '@/core/metadata';
import {
  assertSliceForConnection,
  filterSourcesForSlice,
  formatQueryForDisplay,
  isAccessDeniedError,
  isCouchbaseSliceEnabled,
  isMissingColumnError,
  queryLanguageForConnection,
  renderChartConfig,
} from '@/dataLayer';
import {
  CouchbaseNotReadyError,
  CouchbaseUnsupportedError,
} from '@/dataLayer/errors';
import {
  primeConnectionKind,
  resetConnectionKindState,
} from '@/dataLayer/kind';
import { RoutingNodeClickhouseClient } from '@/dataLayer/node';
import {
  getRoutingMetadata,
  RoutingMetadata,
} from '@/dataLayer/routingMetadata';

const calls: unknown[] = [];

jest.mock('@/couchbase/node', () => ({
  CouchbaseNodeClient: class {
    async query(inputs: unknown) {
      calls.push(inputs);
      return {
        query_id: 'cb',
        async json() {
          return { data: [], meta: [], rows: 0, statistics: {} };
        },
        async text() {
          return '';
        },
        stream() {
          return new ReadableStream();
        },
        close() {
          return undefined;
        },
      };
    }
    async close() {
      return undefined;
    }
  },
}));

const fakeResult = {
  query_id: 'ch',
  async json() {
    return { data: [], meta: [], rows: 0, statistics: {} };
  },
  async text() {
    return '';
  },
  stream() {
    return new ReadableStream();
  },
  close() {
    return undefined;
  },
} as unknown as BaseResultSet<ReadableStream, 'JSON'>;

const PRIVATE = new Set([
  'renderMetadataKeyExpression',
  'queryTableMetadata',
  'querySkipIndices',
  'partsOverlapFilter',
  'assertIndexReadable',
  'getMapTextIndexKeyValues',
  'getTextIndexKeyValues',
  'getMetadataMVKeyValues',
  'doMetadataMVsAggregateColumn',
  'determineKeyValueFetchingStrategy',
  'dispatchAllKeyValueQueries',
  'dispatchKeyValueQueries',
]);

beforeEach(() => {
  resetConnectionKindState();
  calls.length = 0;
});

describe('routing client', () => {
  function client() {
    return new RoutingNodeClickhouseClient({
      host: 'http://127.0.0.1:1',
      loadCouchbaseConnection: async () => ({
        id: 'cb',
        host: 'couchbase://127.0.0.1',
        username: 'u',
        password: 'p',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    });
  }

  it('sends a clickhouse connection through the parent query', async () => {
    const spy = jest
      .spyOn(ClickhouseClient.prototype, 'query')
      .mockResolvedValue(fakeResult);
    const result = await client().query({
      query: 'SELECT 1',
      connectionId: 'ch',
      format: 'JSON',
    });
    expect(result).toBe(fakeResult);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'SELECT 1', connectionId: 'ch' }),
    );
    expect(calls).toHaveLength(0);
    spy.mockRestore();
  });

  it('maps a couchbase query onto the couchbase client', async () => {
    primeConnectionKind('cb', 'couchbase');
    await client().query({
      query: 'SELECT 1',
      query_params: { p0: 1 },
      format: 'JSON',
      connectionId: 'cb',
      queryId: 'q1',
    });
    expect(calls[0]).toMatchObject({
      query: 'SELECT 1',
      query_params: { p0: 1 },
      format: 'JSON',
      connectionId: 'cb',
      queryId: 'q1',
    });
  });

  it('rejects a format the couchbase client cannot return', async () => {
    primeConnectionKind('cb', 'couchbase');
    await expect(
      client().query({
        query: 'SELECT 1',
        format: 'Pretty' as 'JSON',
        connectionId: 'cb',
      }),
    ).rejects.toThrow(CouchbaseUnsupportedError);
    await expect(
      client().query({
        query: 'SELECT 1',
        format: 'Pretty' as 'JSON',
        connectionId: 'cb',
      }),
    ).rejects.toThrow('Not supported on Couchbase: format Pretty.');
  });
});

describe('routing metadata', () => {
  const publicNames = Object.getOwnPropertyNames(Metadata.prototype).filter(
    name => name !== 'constructor' && !PRIVATE.has(name),
  );

  it('overrides every public Metadata method', () => {
    const routed = new Set(
      Object.getOwnPropertyNames(RoutingMetadata.prototype),
    );
    for (const name of publicNames) {
      expect(routed.has(name)).toBe(true);
    }
  });

  it('calls the clickhouse implementation when the connection is clickhouse', async () => {
    const base = { query: jest.fn(), close: jest.fn() };
    const meta = getRoutingMetadata(base as never);
    primeConnectionKind('ch', 'clickhouse');
    const spy = jest
      .spyOn(Metadata.prototype, 'getColumns')
      .mockResolvedValue([]);
    await meta.getColumns({
      connectionId: 'ch',
      databaseName: 'db',
      tableName: 't',
    });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('forwards every public method to clickhouse or couchbase', async () => {
    const base = { query: jest.fn(), close: jest.fn() };
    const meta = getRoutingMetadata(base as never);
    primeConnectionKind('ch', 'clickhouse');
    const args = {
      connectionId: 'ch',
      connection: 'ch',
      databaseName: 'db',
      tableName: 't',
      column: 'c',
      key: 'k',
      keys: ['k'],
      keyExpressions: ['k'],
      chartConfig: {
        connection: 'ch',
        from: { databaseName: 'db', tableName: 't' },
      },
    };
    for (const name of publicNames) {
      const spy = jest.spyOn(Metadata.prototype, name as never);
      const method = Object.getOwnPropertyDescriptor(
        RoutingMetadata.prototype,
        name,
      )?.value;
      if (typeof method !== 'function') throw new Error(name);
      if (name.startsWith('stream')) {
        spy.mockReturnValue((async function* () {})() as never);
        for await (const row of method.call(meta, args)) {
          void row;
        }
      } else if (name === 'setClickHouseSettings') {
        meta.setClickHouseSettings({});
      } else if (name === 'getClickHouseSettings') {
        meta.getClickHouseSettings();
      } else {
        spy.mockResolvedValue([] as never);
        await method.call(meta, args);
      }
      spy.mockRestore();
    }
  });
});

describe('seam display helpers', () => {
  it('renders clickhouse and sqlpp queries for display', () => {
    expect(
      formatQueryForDisplay({ sql: 'SELECT {p0:String}', params: { p0: 'a' } }),
    ).toContain('a');
    expect(
      formatQueryForDisplay({
        sql: 'SELECT $name',
        params: { name: 'logs' },
        dialect: 'sqlpp',
      }),
    ).toContain('"logs"');
  });

  it('routes chart rendering to clickhouse when the kind is unset', async () => {
    const rendered = await renderChartConfig(
      {
        connection: 'ch',
        from: { databaseName: 'db', tableName: 't' },
        timestampValueExpression: 'Timestamp',
        select: [{ aggFn: 'count', valueExpression: '' }],
        where: '',
        whereLanguage: 'lucene',
      } as never,
      { getColumns: async () => [] } as never,
      undefined,
    );
    expect(rendered.sql.length).toBeGreaterThan(0);
    expect(rendered.dialect).not.toBe('sqlpp');
  });

  it('hides couchbase sources while a slice is off', async () => {
    expect(isCouchbaseSliceEnabled('external_api')).toBe(false);
    primeConnectionKind('cb', 'couchbase');
    const kept = await filterSourcesForSlice(
      [{ connection: 'ch' }, { connection: 'cb' }],
      'external_api',
    );
    expect(kept.map(source => source.connection)).toEqual(['ch']);
  });

  it('reports a couchbase chart as not ready', async () => {
    primeConnectionKind('cb', 'couchbase');
    const routing = new RoutingNodeClickhouseClient({
      host: 'http://127.0.0.1:1',
      loadCouchbaseConnection: async () => ({
        id: 'cb',
        host: 'couchbase://127.0.0.1',
        username: 'u',
        password: 'p',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
    });
    const args = {
      config: { connection: 'cb', configType: 'sql' } as never,
      metadata: {} as never,
      querySettings: undefined,
    };
    await expect(routing.queryChartConfig(args)).rejects.toThrow(
      /Couchbase sources yet/,
    );
    expect(await routing.testChartConfigValidity(args)).toMatchObject({
      isValid: false,
    });
    await routing.close();
  });

  it('combines dialect error checks', () => {
    expect(isMissingColumnError(undefined)).toBe(false);
    expect(isAccessDeniedError(undefined)).toBe(false);
  });

  it('assertSliceForConnection rejects couchbase when the slice is off', async () => {
    primeConnectionKind('cb', 'couchbase');
    await expect(
      assertSliceForConnection('external_api', 'cb'),
    ).rejects.toBeInstanceOf(CouchbaseNotReadyError);
    await expect(
      assertSliceForConnection('alerts', 'cb'),
    ).resolves.toBeUndefined();
  });

  it('queryLanguageForConnection maps connection kind', async () => {
    primeConnectionKind('cb', 'couchbase');
    primeConnectionKind('ch', 'clickhouse');
    expect(await queryLanguageForConnection('cb')).toBe('sqlpp');
    expect(await queryLanguageForConnection('ch')).toBe('clickhouse');
  });
});
