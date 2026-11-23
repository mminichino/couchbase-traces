import { declaredColumns } from '@/couchbase/otelSchema';
import { renderChartConfigCouchbase } from '@/couchbase/render';
import { DisplayType, MetricsDataType } from '@/types';

// D27: ports upstream renderChartConfig.test.ts "metric points with no
// recorded value". Upstream renderMetricWhere appends `bitAnd(Flags, 1) = 0`
// (OTLP FLAG_NO_RECORDED_VALUE) to every metric source scan when the table
// has a non-nullable integer Flags column. Collections have no column types,
// so the SQL++ form reads a missing, null, or non-integer Flags (BITAND
// returns NULL for those) as 0, which is upstream's "read as before".
const NO_RECORDED_VALUE_FILTER = 'IFMISSINGORNULL(BITAND(d.Flags, 1), 0) = 0';

const TABLES = {
  gauge: 'otel_metrics_gauge',
  sum: 'otel_metrics_sum',
  histogram: 'otel_metrics_histogram',
  'exponential histogram': 'otel_metrics_exponential_histogram',
};

const render = (
  metricType: MetricsDataType,
  select: Record<string, unknown>,
  extra: Record<string, unknown> = {},
) =>
  renderChartConfigCouchbase(
    {
      displayType: DisplayType.Line,
      connection: 'c',
      from: { databaseName: 'otel', scopeName: 'default', tableName: '' },
      metricTables: TABLES,
      select: [
        {
          aggCondition: '',
          aggConditionLanguage: 'sql',
          valueExpression: 'Value',
          metricName: 'test.metric',
          metricType,
          ...select,
        },
      ],
      where: '',
      timestampValueExpression: 'TimeUnix',
      dateRange: [
        new Date('2022-01-05T00:00:00Z'),
        new Date('2022-01-05T00:02:00Z'),
      ],
      granularity: '1 minute',
      ...extra,
    } as never,
    {
      getColumns: async ({ tableName }: { tableName: string }) =>
        declaredColumns(tableName) ?? [],
    } as never,
    undefined,
  );

const cases = [
  [MetricsDataType.Gauge, { aggFn: 'avg' }],
  [MetricsDataType.Sum, { aggFn: 'avg' }],
  [MetricsDataType.Histogram, { aggFn: 'quantile', level: 0.5 }],
  [MetricsDataType.Histogram, { aggFn: 'count' }],
  [MetricsDataType.ExponentialHistogram, { aggFn: 'quantile', level: 0.5 }],
  [MetricsDataType.ExponentialHistogram, { aggFn: 'count' }],
] as const;

describe('D27 metric points with no recorded value', () => {
  it.each(cases)(
    'leaves flagged points out of the %s source scan (%o)',
    async (metricType, select) => {
      const { sql } = await render(metricType, select);
      expect(sql).toMatch(
        /AS d WHERE \(MetricName = 'test\.metric'\) AND d\.TimeUnix >= \$p\d+ AND d\.TimeUnix <= \$p\d+ AND IFMISSINGORNULL\(BITAND\(d\.Flags, 1\), 0\) = 0/,
      );
      expect(sql.split(NO_RECORDED_VALUE_FILTER)).toHaveLength(2);
    },
  );

  // Gauge and Sum always bucket (granularity || 'auto', as upstream), so
  // they need a date range; histograms render without one.
  it.each(cases.slice(2))(
    'applies the filter without a date range (%s, %o)',
    async (metricType, select) => {
      const { sql } = await render(metricType, select, {
        displayType: DisplayType.Number,
        dateRange: undefined,
        granularity: undefined,
      });
      expect(sql.split(NO_RECORDED_VALUE_FILTER)).toHaveLength(2);
    },
  );

  it('filters each multi-series branch once', async () => {
    const sel = (metricName: string) => ({
      aggFn: 'max',
      metricName,
      metricType: MetricsDataType.Gauge,
      valueExpression: 'Value',
      aggCondition: '',
    });
    const { sql } = await render(
      MetricsDataType.Gauge,
      {},
      {
        select: [sel('a'), sel('b')],
      },
    );
    expect(sql.split(NO_RECORDED_VALUE_FILTER)).toHaveLength(3);
  });

  it('appends the filter after the chart where, as upstream', async () => {
    const { sql } = await render(
      MetricsDataType.Gauge,
      { aggFn: 'avg' },
      { where: "ServiceName = 'api'" },
    );
    expect(sql).toContain(
      `(ServiceName = 'api') AND ${NO_RECORDED_VALUE_FILTER}`,
    );
  });
});
