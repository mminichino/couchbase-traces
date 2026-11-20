import type { ChartConfigWithOptDateRangeEx } from '@/core/chartConfig';
import { renderChartConfigCouchbase } from '@/couchbase/render';
import { DisplayType, MetricsDataType } from '@/types';

import { metadata, metricSeriesConfig } from './defectFixtures';

const render = (config: unknown) =>
  renderChartConfigCouchbase(
    config as ChartConfigWithOptDateRangeEx,
    metadata,
    undefined,
  );

/** Every `FLOOR(STR_TO_MILLIS(<col>) / <ms>)` bucket width in the statement. */
const bucketWidths = (sql: string) =>
  [...sql.matchAll(/FLOOR\(STR_TO_MILLIS\([^)]*\) \/ (\d+)\)/g)].map(m => m[1]);

// D1: `granularity: 'auto'` threw "Unsupported granularity: auto" for gauge
// and sum metric series (external charts API, 14 x 500 in R0; cbt_query_tile
// metric formula tile).
describe("D1 granularity 'auto' on metric series", () => {
  it.each([
    ['gauge', 'avg', 'test.metric.gauge', MetricsDataType.Gauge],
    ['sum', 'sum', 'test.metric.sum', MetricsDataType.Sum],
  ] as const)(
    'renders a %s series and buckets inner and outer alike',
    async (_kind, aggFn, metricName, metricType) => {
      const q = await render(
        metricSeriesConfig({ aggFn, metricName, metricType }),
      );
      // One hour, default auto bucket count: 1 minute buckets everywhere.
      const widths = bucketWidths(q.sql);
      expect(widths.length).toBeGreaterThanOrEqual(2);
      expect(new Set(widths)).toEqual(new Set(['60000']));
      expect(q.sql).toContain('`__hdx_time_bucket`');
    },
  );

  it('honors minGranularitySeconds when resolving auto', async () => {
    const q = await render(
      metricSeriesConfig(
        {
          aggFn: 'avg',
          metricName: 'test.metric.gauge',
          metricType: MetricsDataType.Gauge,
        },
        { minGranularitySeconds: 300 },
      ),
    );
    expect(new Set(bucketWidths(q.sql))).toEqual(new Set(['300000']));
  });

  it('renders a multi-series gauge and sum chart (cbt_query_tile formula tile)', async () => {
    const base = metricSeriesConfig({
      aggFn: 'avg',
      metricName: 'test.metric.gauge',
      metricType: MetricsDataType.Gauge,
    });
    const q = await render({
      ...base,
      select: [
        base.select[0],
        {
          ...base.select[0],
          aggFn: 'sum',
          alias: 'series_1',
          metricName: 'test.metric.sum',
          metricType: MetricsDataType.Sum,
        },
      ],
    });
    expect(new Set(bucketWidths(q.sql))).toEqual(new Set(['60000']));
  });

  it('keeps a non-timeseries gauge without a time bucket', async () => {
    const q = await render(
      metricSeriesConfig(
        {
          aggFn: 'avg',
          metricName: 'test.metric.gauge',
          metricType: MetricsDataType.Gauge,
        },
        { granularity: undefined, displayType: DisplayType.Number },
      ),
    );
    expect(q.sql).not.toContain('AS `__hdx_time_bucket`');
  });

  it('still rejects auto when there is no date range to size it', async () => {
    await expect(
      render(
        metricSeriesConfig(
          {
            aggFn: 'avg',
            metricName: 'test.metric.gauge',
            metricType: MetricsDataType.Gauge,
          },
          { dateRange: undefined },
        ),
      ),
    ).rejects.toThrow(/granularity/i);
  });
});
