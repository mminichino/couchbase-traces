import { DisplayType } from '@couchbase-traces/common-utils/dist/types';

import { getResponseMetadata } from '@/tasks/checkAlerts';

type Config = Parameters<typeof getResponseMetadata>[0];
type Data = Parameters<typeof getResponseMetadata>[1];

const rawSql = (displayType: DisplayType) =>
  ({
    configType: 'sql',
    displayType,
    sqlTemplate: 'SELECT 1',
    connection: 'c1',
  }) as Config;

const data = (meta: Data['meta'], rows: Data['data'] = []) =>
  ({ meta, data: rows }) as Data;

describe('getResponseMetadata', () => {
  // SQL++ has no column header for zero rows; ClickHouse does (R2b).
  it('treats a zero-row, zero-column time-series result as an empty window', () => {
    expect(getResponseMetadata(rawSql(DisplayType.Line), data([]))).toEqual({
      type: 'time_series',
      timestampColumnName: '',
      valueColumnNames: new Set(),
    });
  });

  it('treats a zero-row, zero-column Number result as a single empty value', () => {
    expect(getResponseMetadata(rawSql(DisplayType.Number), data([]))).toEqual({
      type: 'single_value',
      valueColumnNames: new Set(),
    });
  });

  it('still rejects rows without a numeric column', () => {
    expect(
      getResponseMetadata(
        rawSql(DisplayType.Line),
        data([{ name: 'ts', type: 'DateTime64(3)' }], [{ ts: '2023-01-01' }]),
      ),
    ).toBeUndefined();
  });

  it('reads columns from meta when rows are present', () => {
    expect(
      getResponseMetadata(
        rawSql(DisplayType.Line),
        data(
          [
            { name: 'ts', type: 'DateTime64(3)' },
            { name: 'cnt', type: 'UInt64' },
          ],
          [{ ts: '2023-01-01T00:00:00Z', cnt: '3' }],
        ),
      ),
    ).toEqual({
      type: 'time_series',
      timestampColumnName: 'ts',
      valueColumnNames: new Set(['cnt']),
    });
  });
});
