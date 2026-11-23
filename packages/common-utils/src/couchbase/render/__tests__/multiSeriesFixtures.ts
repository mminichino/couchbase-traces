import { renderChartConfigCouchbase } from '@/couchbase/render';
import { DisplayType, MetricsDataType } from '@/types';

import { metadata } from './defectFixtures';

/**
 * D17 fixtures: the inputs of upstream renderChartConfig.test.ts
 * "multi-series metric charts (composed query)".
 */
export const gaugeSelect = (metricName: string) => ({
  aggFn: 'avg' as const,
  aggCondition: '',
  aggConditionLanguage: 'sql' as const,
  valueExpression: 'Value',
  metricName,
  metricType: MetricsDataType.Gauge,
});

export const histSelect = (metricName: string, level: number) => ({
  aggFn: 'quantile' as const,
  level,
  aggCondition: '',
  aggConditionLanguage: 'sql' as const,
  valueExpression: 'Value',
  metricName,
  metricType: MetricsDataType.Histogram,
});

const base = {
  displayType: DisplayType.Line,
  connection: 'test-connection',
  metricTables: {
    gauge: 'otel_metrics_gauge',
    histogram: 'otel_metrics_histogram',
    sum: 'otel_metrics_sum',
    summary: 'otel_metrics_summary',
    'exponential histogram': 'otel_metrics_exponential_histogram',
  },
  from: { databaseName: 'default', tableName: '' },
  select: [gaugeSelect('metric.alpha'), gaugeSelect('metric.beta')],
  where: '',
  whereLanguage: 'sql',
  timestampValueExpression: 'TimeUnix',
  dateRange: [new Date('2025-02-12'), new Date('2025-02-14')],
  granularity: '1 minute',
};

export const table = { displayType: DisplayType.Table, granularity: undefined };

export const render = async (extra: Record<string, unknown>) =>
  renderChartConfigCouchbase(
    { ...base, ...extra } as never,
    metadata,
    undefined,
  );

export const sqlOf = async (extra: Record<string, unknown>) =>
  (await render(extra)).sql;

export const count = (sql: string, needle: string) =>
  sql.split(needle).length - 1;

/** The statement from the joined result's FROM alias on. */
export const outer = (sql: string) => sql.slice(sql.lastIndexOf(') AS multi'));

export const SERVICE = [{ aggCondition: '', valueExpression: 'ServiceName' }];
export const MAP_KEY = "ResourceAttributes['service.name']";
