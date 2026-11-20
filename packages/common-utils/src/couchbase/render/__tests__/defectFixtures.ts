import type { MetricTable } from '@/types';
import { DisplayType, MetricsDataType } from '@/types';

/** Shared fixtures for the D1 renderer defect tests. */

export const metadata = {
  async getColumns() {
    return [
      { name: 'Timestamp', type: "DateTime64(9, 'UTC')" },
      { name: 'ServiceName', type: 'String' },
      { name: 'SeverityText', type: 'String' },
      { name: 'Body', type: 'String' },
    ];
  },
};

/** One hour: 'auto' resolves to a 1 minute bucket (60000 ms). */
export const dateRange: [Date, Date] = [
  new Date('2026-01-01T00:00:00.000Z'),
  new Date('2026-01-01T01:00:00.000Z'),
];
export const ONE_MINUTE_BUCKET = 'FLOOR(STR_TO_MILLIS(';

// Same metric tables the deferred external charts suite seeds.
const metricTables = {
  [MetricsDataType.Gauge.toLowerCase()]: 'otel_metrics_gauge',
  [MetricsDataType.Sum.toLowerCase()]: 'otel_metrics_sum',
  [MetricsDataType.Histogram.toLowerCase()]: 'otel_metrics_histogram',
} as MetricTable;

/**
 * The chart config `POST /api/v2/charts/series` builds for a metric series
 * when the request has no granularity (charts.ts `buildChartConfigFromRequest`).
 */
export function metricSeriesConfig(
  series: {
    aggFn: string;
    metricName: string;
    metricType: MetricsDataType;
    level?: number;
  },
  extra: Record<string, unknown> = {},
) {
  return {
    displayType: DisplayType.Line,
    connection: 'conn',
    from: { databaseName: 'otel', tableName: '' },
    metricTables,
    select: [
      {
        aggFn: series.aggFn,
        level: series.level,
        valueExpression: 'Value',
        aggCondition: '',
        aggConditionLanguage: 'lucene' as const,
        alias: 'series_0',
        metricName: series.metricName,
        metricType: series.metricType,
      },
    ],
    where: '',
    timestampValueExpression: 'TimeUnix',
    dateRange,
    granularity: 'auto',
    ...extra,
  };
}

/** The config `cbt_table` builds for `select: [{ aggFn: 'count', alias: 'n' }]`. */
export function logTableConfig(extra: Record<string, unknown> = {}) {
  return {
    displayType: DisplayType.Table,
    connection: 'conn',
    from: {
      databaseName: 'otel',
      scopeName: 'default',
      tableName: 'otel_logs',
    },
    select: [
      {
        aggFn: 'count',
        alias: 'n',
        valueExpression: '',
        aggCondition: '',
        aggConditionLanguage: 'sql' as const,
      },
    ],
    groupBy: 'ServiceName',
    where: '',
    whereLanguage: 'lucene' as const,
    timestampValueExpression: 'Timestamp',
    dateRange,
    ...extra,
  };
}
