import { SourceKind } from '@couchbase-traces/common-utils/dist/types';

const configState = {
  DEFAULT_CONNECTIONS: undefined as string | undefined,
  DEFAULT_SOURCES: JSON.stringify([
    {
      kind: 'log',
      name: 'Logs',
      connection: 'Local ClickHouse',
      from: { databaseName: 'default', tableName: 'otel_logs' },
      timestampValueExpression: 'Timestamp',
      defaultTableSelectExpression: 'Timestamp, Body',
    },
    {
      kind: 'promql',
      name: 'PromQL',
      connection: 'Local ClickHouse',
      from: { databaseName: 'default', tableName: 'metrics_ts' },
      timestampValueExpression: 'timestamp',
    },
  ]) as string | undefined,
  DEFAULT_SOURCES_PRESET: undefined as string | undefined,
  COUCHBASE_BUCKET: 'otel',
  COUCHBASE_SCOPE: 'default',
  IS_PROMQL_ENABLED: false,
};

jest.mock('@/config', () => ({
  get DEFAULT_CONNECTIONS() {
    return configState.DEFAULT_CONNECTIONS;
  },
  get DEFAULT_SOURCES() {
    return configState.DEFAULT_SOURCES;
  },
  get DEFAULT_SOURCES_PRESET() {
    return configState.DEFAULT_SOURCES_PRESET;
  },
  get COUCHBASE_BUCKET() {
    return configState.COUCHBASE_BUCKET;
  },
  get COUCHBASE_SCOPE() {
    return configState.COUCHBASE_SCOPE;
  },
  get IS_PROMQL_ENABLED() {
    return configState.IS_PROMQL_ENABLED;
  },
}));

jest.mock('@/controllers/team', () => ({
  getTeam: jest.fn().mockResolvedValue({ _id: 'team-1' }),
}));
const COUCHBASE_CONN_ID = '507f1f77bcf86cd799439011';
const CLICKHOUSE_CONN_ID = '607f1f77bcf86cd799439012';

const getConnectionsMock = jest
  .fn()
  .mockResolvedValue([
    { _id: 'conn-1', team: 'team-1', name: 'Local ClickHouse' },
  ]);

jest.mock('@/controllers/connection', () => ({
  createConnection: jest.fn(),
  getConnections: (...args: unknown[]) => getConnectionsMock(...args),
}));
jest.mock('@/controllers/sources', () => ({
  getSources: jest.fn().mockResolvedValue([]),
  createSource: jest.fn(async (_teamId: string, source: { name: string }) => ({
    _id: `${source.name}-id`,
    toObject: () => source,
  })),
  updateSource: jest.fn(),
}));
jest.mock('@/utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { createSource, updateSource } from '@/controllers/sources';
import { setupTeamDefaults } from '@/setupDefaults';
import logger from '@/utils/logger';

const createdKinds = () =>
  jest.mocked(createSource).mock.calls.map(([, source]) => source.kind);

const resetConfig = () => {
  configState.DEFAULT_CONNECTIONS = JSON.stringify([
    {
      name: 'Local Couchbase',
      kind: 'couchbase',
      host: 'couchbase://couchbase',
      username: 'u',
      password: 'p',
    },
  ]);
  configState.DEFAULT_SOURCES = undefined;
  configState.DEFAULT_SOURCES_PRESET = 'couchbase';
  configState.COUCHBASE_BUCKET = 'otel';
  configState.COUCHBASE_SCOPE = 'default';
  configState.IS_PROMQL_ENABLED = false;
};

describe('setupTeamDefaults', () => {
  beforeEach(() => {
    jest.mocked(createSource).mockClear();
    jest.mocked(updateSource).mockClear();
    getConnectionsMock.mockResolvedValue([
      {
        _id: COUCHBASE_CONN_ID,
        team: 'team-1',
        name: 'Local Couchbase',
        kind: 'couchbase',
      },
    ]);
    resetConfig();
  });

  it('skips a default PromQL source when PromQL is disabled', async () => {
    configState.DEFAULT_SOURCES = JSON.stringify([
      {
        kind: 'log',
        name: 'Logs',
        connection: 'Local ClickHouse',
        from: { databaseName: 'default', tableName: 'otel_logs' },
        timestampValueExpression: 'Timestamp',
        defaultTableSelectExpression: 'Timestamp, Body',
      },
      {
        kind: 'promql',
        name: 'PromQL',
        connection: 'Local ClickHouse',
        from: { databaseName: 'default', tableName: 'metrics_ts' },
        timestampValueExpression: 'timestamp',
      },
    ]);
    configState.DEFAULT_SOURCES_PRESET = undefined;
    getConnectionsMock.mockResolvedValue([
      { _id: 'conn-1', team: 'team-1', name: 'Local ClickHouse' },
    ]);

    await setupTeamDefaults('team-1');

    expect(createdKinds()).toEqual([SourceKind.Log]);
  });

  it('creates four linked Couchbase preset sources on the Couchbase connection', async () => {
    await setupTeamDefaults('team-1');

    expect(createdKinds()).toEqual(['log', 'trace', 'metric', 'session']);
    const logsCall = jest
      .mocked(createSource)
      .mock.calls.find(([, s]) => s.name === 'Logs');
    expect(logsCall?.[1]).toMatchObject({
      connection: COUCHBASE_CONN_ID,
      from: {
        databaseName: 'otel',
        scopeName: 'default',
        tableName: 'otel_logs',
      },
    });
    expect(jest.mocked(updateSource).mock.calls.length).toBeGreaterThan(0);
    const logsUpdate = jest
      .mocked(updateSource)
      .mock.calls.find(
        ([, , payload]) =>
          typeof payload === 'object' &&
          payload != null &&
          'traceSourceId' in payload &&
          Reflect.get(payload, 'traceSourceId') != null,
      );
    expect(logsUpdate?.[2]).toMatchObject({
      traceSourceId: 'Traces-id',
      metricSourceId: 'Metrics-id',
    });
  });

  it('uses CBT_COUCHBASE_BUCKET and CBT_COUCHBASE_SCOPE on preset sources', async () => {
    configState.COUCHBASE_BUCKET = 'mybucket';
    configState.COUCHBASE_SCOPE = 'myscope';

    await setupTeamDefaults('team-1');

    const traceCall = jest
      .mocked(createSource)
      .mock.calls.find(([, s]) => s.name === 'Traces');
    expect(traceCall?.[1].from).toMatchObject({
      databaseName: 'mybucket',
      scopeName: 'myscope',
    });
  });

  it('prefers DEFAULT_SOURCES over the couchbase preset', async () => {
    configState.DEFAULT_SOURCES = JSON.stringify([
      {
        kind: 'log',
        name: 'Custom Logs',
        connection: 'Local Couchbase',
        from: { databaseName: 'otel', tableName: 'otel_logs' },
        timestampValueExpression: 'Timestamp',
      },
    ]);

    await setupTeamDefaults('team-1');

    expect(logger.info).toHaveBeenCalledWith(
      'DEFAULT_SOURCES is set; ignoring CBT_DEFAULT_SOURCES_PRESET',
    );
    expect(jest.mocked(createSource).mock.calls).toHaveLength(1);
    expect(jest.mocked(createSource).mock.calls[0][1].name).toBe('Custom Logs');
  });

  it('logs an error and seeds nothing when no Couchbase connection exists', async () => {
    getConnectionsMock.mockResolvedValue([
      {
        _id: CLICKHOUSE_CONN_ID,
        team: 'team-1',
        name: 'Local ClickHouse',
        kind: 'clickhouse',
      },
    ]);

    await setupTeamDefaults('team-1');

    expect(logger.error).toHaveBeenCalledWith(
      'CBT_DEFAULT_SOURCES_PRESET=couchbase but no Couchbase connection exists for this team; skipping default source seeding',
    );
    expect(jest.mocked(createSource)).not.toHaveBeenCalled();
  });
});
