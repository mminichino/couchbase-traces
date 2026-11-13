import { MetricsDataType } from '@/types';
import type { BuilderChartConfigWithOptDateRange } from '@/types';
import { CouchbaseNotReadyError } from '@/dataLayer/errors';
import { lag } from '@/couchbase/fn/scalar';
import { keyspace } from '@/couchbase/sqlpp';

type MetricSelect = {
  metricType?: string;
  metricName?: string;
  metricNameSql?: string;
  aggFn?: string | null;
  valueExpression?: string;
  isDelta?: boolean;
  alias?: string;
  level?: number;
  aggCondition?: string;
  aggConditionLanguage?: string;
};

/**
 * Translate a metric chart config into a builder config with SQL++ CTEs.
 * Gauge: last Value per (series, bucket) then the requested agg.
 * Sum: per-point Rate via LAG (reset → clamp at 0), then SUM Rate per bucket.
 */
export async function translateMetricChartConfigCouchbase(
  chartConfig: BuilderChartConfigWithOptDateRange,
): Promise<BuilderChartConfigWithOptDateRange> {
  const metricTables = chartConfig.metricTables;
  if (!metricTables) return chartConfig;
  const select = chartConfig.select;
  if (!Array.isArray(select) || select.length === 0) {
    throw new CouchbaseNotReadyError('metrics: select shape');
  }
  if (select.length > 1) {
    throw new CouchbaseNotReadyError('metrics: multi-select');
  }

  const first = select[0] as MetricSelect;
  const metricType = first.metricType as MetricsDataType | undefined;
  const metricName = first.metricName;
  if (!metricType || !metricName) {
    throw new CouchbaseNotReadyError('metrics: metricType/metricName');
  }
  const table = metricTables[metricType as keyof typeof metricTables];
  if (!table) {
    throw new CouchbaseNotReadyError(`metrics: table for ${metricType}`);
  }

  const from = {
    ...chartConfig.from,
    tableName: table,
  };
  const ks = keyspace({
    bucket: from.databaseName,
    scope: from.scopeName || 'default',
    collection: table,
  });
  const nameFilter = first.metricNameSql?.trim()
    ? first.metricNameSql
    : `MetricName = '${metricName.replace(/'/g, "''")}'`;

  if (
    metricType === MetricsDataType.Gauge ||
    metricType === MetricsDataType.Summary
  ) {
    // last_value(Value) per series per bucket via MAX([TimeUnix, Value])[1]
    const seriesKey = `TOSTRING(ENCODE_JSON(IFNULL(Attributes, {})))`;
    const sourceSql = `SELECT d.*, ${seriesKey} AS AttributesHash FROM ${ks} AS d WHERE (${nameFilter})`;
    return {
      ...chartConfig,
      with: [
        {
          name: 'Source',
          sql: { sql: sourceSql, params: {} },
        },
      ],
      from: { databaseName: '', tableName: 'Source' },
      select: [
        {
          ...first,
          // Value is reserved in SQL++; always quote the metric value column.
          valueExpression: first.valueExpression?.trim()
            ? first.valueExpression
            : '`Value`',
          aggCondition: '',
          metricType: undefined,
          metricName: undefined,
          metricNameSql: undefined,
        } as (typeof select)[0],
      ],
      where: '',
      timestampValueExpression: 'TimeUnix',
    };
  }

  if (metricType === MetricsDataType.Sum) {
    const seriesKey = `TOSTRING(ENCODE_JSON(IFNULL(Attributes, {})))`;
    const lagExpr = lag('`Value`', 'AttributesHash', 'TimeUnix');
    const rateExpr =
      first.aggFn === 'increase' || first.isDelta
        ? `GREATEST(TONUMBER(\`Value\`) - TONUMBER(IFNULL(${lagExpr}, \`Value\`)), 0)`
        : `TONUMBER(\`Value\`)`;
    const sourceSql = `SELECT d.*, ${seriesKey} AS AttributesHash, ${rateExpr} AS Rate FROM ${ks} AS d WHERE (${nameFilter})`;
    return {
      ...chartConfig,
      with: [
        {
          name: 'Source',
          sql: { sql: sourceSql, params: {} },
        },
      ],
      from: { databaseName: '', tableName: 'Source' },
      select: [
        {
          ...first,
          aggFn: first.aggFn === 'increase' ? 'sum' : first.aggFn,
          valueExpression: first.aggFn === 'increase' ? 'Rate' : '`Value`',
          aggCondition: '',
          metricType: undefined,
          metricName: undefined,
          metricNameSql: undefined,
        } as (typeof select)[0],
      ],
      where: '',
      timestampValueExpression: 'TimeUnix',
    };
  }

  if (
    metricType === MetricsDataType.Histogram ||
    metricType === MetricsDataType.ExponentialHistogram
  ) {
    throw new CouchbaseNotReadyError(`metrics: ${metricType}`);
  }

  throw new CouchbaseNotReadyError(`metrics: ${metricType}`);
}
