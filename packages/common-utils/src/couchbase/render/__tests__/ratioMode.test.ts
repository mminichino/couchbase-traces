import { renderChartConfigCouchbase } from '@/couchbase/render';

import { metadata } from './defectFixtures';

// D16: inputs follow the deferred checkAlerts case "TILE alert (metrics,
// grouped ratio) - honors ratioMode share_of_total". Upstream divides each
// group's numerator by the denominator total across the bucket's groups:
// `sum(<denominator>) OVER (PARTITION BY __hdx_time_bucket)`.

const config = (extra: Record<string, unknown> = {}) => ({
  connection: 'conn-d16',
  from: { databaseName: 'otel', tableName: '' },
  metricTables: { gauge: 'otel_metrics_gauge' },
  timestampValueExpression: 'TimeUnix',
  where: '',
  select: [
    {
      aggFn: 'max',
      valueExpression: 'Value',
      metricType: 'gauge',
      metricName: 'test.errors',
      aggCondition: '',
    },
    {
      aggFn: 'max',
      valueExpression: 'Value',
      metricType: 'gauge',
      metricName: 'test.requests',
      aggCondition: '',
    },
  ],
  seriesReturnType: 'ratio',
  groupBy: 'ServiceName',
  granularity: '5 minute',
  dateRange: [
    new Date('2023-11-16T22:05:00.000Z'),
    new Date('2023-11-16T22:10:00.000Z'),
  ],
  ...extra,
});

const render = async (c: unknown) =>
  (await renderChartConfigCouchbase(c as never, metadata, undefined)).sql;

const DENOMINATOR =
  'MAX(CASE WHEN `__hdx_series_idx` = 1 THEN `__hdx_value` END)';

describe('D16 multi-series ratio modes', () => {
  it('divides by the per-bucket denominator total in share_of_total mode', async () => {
    const sql = await render(config({ ratioMode: 'share_of_total' }));
    expect(sql).toContain(
      `NULLIF(SUM(${DENOMINATOR}) OVER (PARTITION BY \`__hdx_time_bucket\`), 0)`,
    );
  });

  it('totals across all rows when there is no time bucket', async () => {
    const sql = await render(
      config({ ratioMode: 'share_of_total', granularity: undefined }),
    );
    expect(sql).toContain(`NULLIF(SUM(${DENOMINATOR}) OVER (), 0)`);
  });

  it('keeps each row on its own denominator by default (per_group)', async () => {
    for (const extra of [{}, { ratioMode: 'per_group' }]) {
      const sql = await render(config(extra));
      expect(sql).toContain(`NULLIF(${DENOMINATOR}, 0)`);
      expect(sql).not.toContain(' OVER ');
    }
  });
});
