import { Types } from 'mongoose';

import { ROW_ID_ALIAS } from '@couchbase-traces/common-utils/dist/couchbase/render';
import { DisplayType } from '@couchbase-traces/common-utils/dist/types';

import { runSearchConfig } from '@/routers/external-api/v2/utils/search';

jest.mock('@/controllers/sources', () => ({
  getSource: jest.fn(),
}));
jest.mock('@/controllers/connection', () => ({
  getConnectionById: jest.fn(),
}));
jest.mock('@couchbase-traces/common-utils/dist/dataLayer', () => {
  const actual = jest.requireActual(
    '@couchbase-traces/common-utils/dist/dataLayer',
  );
  return {
    ...actual,
    assertSliceForConnection: jest.fn(),
    getMetadata: jest.fn().mockReturnValue({}),
  };
});
jest.mock('@/clickhouse', () => ({
  ClickhouseClient: jest.fn().mockImplementation(() => ({
    queryChartConfig: jest.fn().mockResolvedValue({
      data: [
        { Timestamp: '2026-01-01T00:00:00Z', [ROW_ID_ALIAS]: 'log::abc' },
        { Timestamp: '2026-01-01T00:00:01Z', Body: 'hello' },
      ],
    }),
  })),
}));

import { getConnectionById } from '@/controllers/connection';
import { getSource } from '@/controllers/sources';
import { assertSliceForConnection } from '@couchbase-traces/common-utils/dist/dataLayer';

const mockedGetSource = getSource as jest.MockedFunction<typeof getSource>;
const mockedGetConnection = getConnectionById as jest.MockedFunction<
  typeof getConnectionById
>;
const mockedAssertSlice = assertSliceForConnection as jest.MockedFunction<
  typeof assertSliceForConnection
>;

describe('runSearchConfig', () => {
  const teamId = new Types.ObjectId().toString();
  const sourceId = new Types.ObjectId().toString();
  const connectionId = new Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAssertSlice.mockResolvedValue(undefined);
    mockedGetSource.mockResolvedValue({
      connection: connectionId,
      kind: 'log',
      from: { databaseName: 'default', tableName: 'logs' },
      timestampValueExpression: 'Timestamp',
    } as any);
    mockedGetConnection.mockResolvedValue({
      host: 'http://localhost:8123',
      username: 'default',
      password: '',
    } as any);
  });

  it('calls assertSliceForConnection with external_api', async () => {
    await runSearchConfig({
      teamId,
      config: {
        displayType: DisplayType.Search,
        sourceId,
        select: '',
        where: '',
        whereLanguage: 'lucene',
      },
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2026-01-01T01:00:00Z'),
      maxResults: 10,
      offset: 0,
    });

    expect(mockedAssertSlice).toHaveBeenCalledWith(
      'external_api',
      connectionId.toString(),
    );
  });

  it('strips __cbt_id from result rows', async () => {
    const result = await runSearchConfig({
      teamId,
      config: {
        displayType: DisplayType.Search,
        sourceId,
        select: '',
        where: '',
        whereLanguage: 'lucene',
      },
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2026-01-01T01:00:00Z'),
      maxResults: 10,
      offset: 0,
    });

    expect(result.isError).toBe(false);
    if (result.isError) return;
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).not.toHaveProperty(ROW_ID_ALIAS);
    expect(result.data[0]).toMatchObject({ Timestamp: '2026-01-01T00:00:00Z' });
    expect(result.data[1]).toEqual({
      Timestamp: '2026-01-01T00:00:01Z',
      Body: 'hello',
    });
  });
});
