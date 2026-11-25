import type { Metadata } from '@couchbase-traces/common-utils/dist/core/metadata';
import type { ColumnMeta } from '@couchbase-traces/common-utils/dist/query/types';
import { MetricsDataType } from '@couchbase-traces/common-utils/dist/types';

import { isValidMetricTable } from '@/source';

function metadataWith(names: string[]): Pick<Metadata, 'getColumns'> {
  const columns: ColumnMeta[] = names.map(name => ({
    name,
    type: 'String',
    codec_expression: '',
    comment: '',
    default_expression: '',
    default_type: '',
    ttl_expression: '',
  }));
  return { getColumns: jest.fn(() => Promise.resolve(columns)) };
}

const base = { databaseName: 'otel', connectionId: 'c1' };

describe('isValidMetricTable', () => {
  it('accepts an empty collection with no inferable schema', async () => {
    await expect(
      isValidMetricTable({
        ...base,
        tableName: 'otel_metrics_gauge',
        metricType: MetricsDataType.Gauge,
        metadata: metadataWith([]),
      }),
    ).resolves.toBe(true);
  });

  it('rejects a populated collection missing required columns', async () => {
    await expect(
      isValidMetricTable({
        ...base,
        tableName: 'otel_logs',
        metricType: MetricsDataType.Gauge,
        metadata: metadataWith(['Body']),
      }),
    ).resolves.toBe(false);
  });

  it('keeps the series table strict when empty', async () => {
    await expect(
      isValidMetricTable({
        ...base,
        tableName: 'otel_metrics_series',
        metricType: 'series',
        metadata: metadataWith([]),
      }),
    ).resolves.toBe(false);
  });

  it('returns false without a table name', async () => {
    await expect(
      isValidMetricTable({
        ...base,
        metricType: MetricsDataType.Gauge,
        metadata: metadataWith([]),
      }),
    ).resolves.toBe(false);
  });
});
