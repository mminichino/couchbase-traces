import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DisplayType } from '@couchbase-traces/common-utils/dist/types';
import type { SavedChartConfig } from '@couchbase-traces/common-utils/dist/types';

import {
  primeConnectionKind,
  resetConnectionKindState,
} from '@couchbase-traces/common-utils/dist/dataLayer/kind';

import type { CliDataClient, SourceResponse } from '@/api/client';
import { fetchTileData } from '@/shared/tileQuery';

const dateRange: [Date, Date] = [
  new Date('2026-07-10T00:00:00Z'),
  new Date('2026-07-10T01:00:00Z'),
];

const source: SourceResponse = {
  id: 'src-1',
  _id: 'src-1',
  name: 'Logs',
  kind: 'log',
  connection: 'cb-conn',
  from: { databaseName: 'default', tableName: 'otel_logs' },
  timestampValueExpression: 'TimestampTime',
  implicitColumnExpression: 'Body',
  bodyExpression: 'Body',
};

const builderConfig: SavedChartConfig = {
  name: 'Requests',
  source: 'src-1',
  displayType: DisplayType.Line,
  select: [{ aggFn: 'count', aggCondition: '', valueExpression: '' }],
  where: '',
  whereLanguage: 'lucene',
};

beforeEach(() => {
  resetConnectionKindState();
  primeConnectionKind('cb-conn', 'couchbase');
});

describe('fetchTileData', () => {
  it('executes chart queries through the routing client on couchbase sources', async () => {
    const chartJson = {
      data: [{ ts: '2026-01-01', count: 3 }],
      meta: [{ name: 'count', type: 'UInt64' }],
    };
    const queryChartConfig = jest
      .fn<CliDataClient['queryChartConfig']>()
      .mockResolvedValue(chartJson);
    const clickhouseClient = { queryChartConfig } as unknown as CliDataClient;

    const result = await fetchTileData({
      clickhouseClient,
      metadata: { tables: {}, databases: {} } as never,
      config: builderConfig,
      source,
      dateRange,
    });

    expect(result.status).toBe('ok');
    expect(queryChartConfig).toHaveBeenCalledTimes(1);
    const call = queryChartConfig.mock.calls[0]?.[0];
    expect(call?.config.connection).toBe('cb-conn');
  });
});
