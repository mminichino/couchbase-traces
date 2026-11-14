import { getHeatmapMode } from '@couchbase-traces/common-utils/dist/core/heatmap';
import {
  getAlignedDateRange,
  getTimeChartGranularity,
  HEATMAP_AUTO_GRANULARITY_BUCKETS,
} from '@couchbase-traces/common-utils/dist/core/utils';
import {
  BuilderChartConfigWithDateRange,
  ChartConfigWithDateRange,
  DisplayType,
  SQLInterval,
} from '@couchbase-traces/common-utils/dist/types';

import { convertToTimeChartConfig, isAggregateFunction } from '@/ChartUtils';

import { heatmapLowQuantile } from './heatmapBounds';
import type { HeatmapScaleType } from './heatmapGrid';

export type HeatmapChartConfig = {
  displayType: DisplayType.Heatmap;
  select: [
    {
      aggFn: 'heatmap';
      valueExpression: string;
      countExpression?: string;
    },
  ];
  from: BuilderChartConfigWithDateRange['from'];
  where: BuilderChartConfigWithDateRange['where'];
  dateRange: BuilderChartConfigWithDateRange['dateRange'];
  granularity: BuilderChartConfigWithDateRange['granularity'];
  timestampValueExpression: BuilderChartConfigWithDateRange['timestampValueExpression'];
  numberFormat?: BuilderChartConfigWithDateRange['numberFormat'];
  filters?: BuilderChartConfigWithDateRange['filters'];
  connection: string;
  with?: BuilderChartConfigWithDateRange['with'];
};

/** Builder/SQL heatmaps only; PromQL modes were removed in Phase 10. */
export type HeatmapSeriesChartConfig = BuilderChartConfigWithDateRange;

/** @deprecated PromQL heatmaps removed; kept for import stability. */
export const PROMQL_DEFAULT_HEATMAP_SCALE_TYPE: HeatmapScaleType = 'linear';

export type HeatmapQuery =
  | {
      mode: 'distribution';
      config: HeatmapChartConfig;
      scaleType: HeatmapScaleType;
    }
  | {
      mode: 'series';
      config: HeatmapSeriesChartConfig;
    };

/**
 * `minGranularitySeconds` floors only auto granularity: an explicit
 * granularity is the user's choice and is kept as-is.
 */
export function resolveHeatmapGranularity({
  granularity,
  dateRange,
  minGranularitySeconds,
}: Pick<
  BuilderChartConfigWithDateRange,
  'granularity' | 'dateRange' | 'minGranularitySeconds'
>): SQLInterval {
  return getTimeChartGranularity(
    granularity,
    dateRange,
    minGranularitySeconds,
    HEATMAP_AUTO_GRANULARITY_BUCKETS,
  );
}

export function toHeatmapQuery(config: HeatmapSeriesChartConfig): HeatmapQuery {
  const mode = getHeatmapMode(config);
  if (mode === 'series') {
    return { mode: 'series', config };
  }

  const firstSelect = Array.isArray(config.select)
    ? config.select[0]
    : undefined;
  return {
    mode: 'distribution',
    config: {
      ...config,
      displayType: DisplayType.Heatmap,
      select: [
        {
          aggFn: 'heatmap' as const,
          valueExpression: firstSelect?.valueExpression ?? '',
          countExpression: firstSelect?.countExpression,
        },
      ],
      granularity: config.granularity,
      numberFormat: config.numberFormat,
    },
    scaleType: firstSelect?.heatmapScaleType ?? 'log',
  };
}

export function buildHeatmapSeriesConfig(
  config: HeatmapSeriesChartConfig,
  granularity: SQLInterval,
): ChartConfigWithDateRange {
  return convertToTimeChartConfig({
    ...config,
    ...(Array.isArray(config.select)
      ? { select: config.select.slice(0, 1) }
      : {}),
    granularity,
    seriesLimit: undefined,
    heatmap: undefined,
  });
}

/**
 * Build the bounds (min/max) ChartConfig that runs first.  Result feeds
 * `effectiveMin`/`max` into `buildHeatmapBucketConfig`.
 */
export function buildHeatmapBoundsConfig({
  config,
  scaleType,
  granularity,
}: {
  config: HeatmapChartConfig;
  scaleType: HeatmapScaleType;
  granularity: SQLInterval;
}): BuilderChartConfigWithDateRange {
  const valueExpression = config.select[0].valueExpression;
  const isAggregateExpression = isAggregateFunction(valueExpression);
  const qLo = heatmapLowQuantile(scaleType);

  return isAggregateExpression
    ? {
        ...config,
        where: '',
        orderBy: undefined,
        granularity: undefined,
        select: [
          {
            aggFn: 'quantile' as const,
            level: qLo,
            aggCondition: `value_calc >= 0`,
            aggConditionLanguage: 'sql',
            valueExpression: 'value_calc',
            alias: 'min',
          },
          {
            aggFn: 'max' as const,
            valueExpression: 'value_calc',
            alias: 'max',
          },
        ],
        with: [
          {
            name: 'min_max_calc',
            chartConfig: {
              ...config,
              select: [{ valueExpression, alias: 'value_calc' }],
              orderBy: undefined,
              granularity,
            },
          },
        ],
        timestampValueExpression: '__hdx_time_bucket',
        dateRange: getAlignedDateRange(config.dateRange, granularity),
        from: { databaseName: '', tableName: 'min_max_calc' },
      }
    : {
        ...config,
        orderBy: undefined,
        granularity: undefined,
        select: [
          {
            aggFn: 'quantile' as const,
            level: qLo,
            valueExpression,
            aggCondition: `${valueExpression} >= 0`,
            aggConditionLanguage: 'sql',
            alias: 'min',
          },
          {
            aggFn: 'max' as const,
            valueExpression,
            alias: 'max',
          },
        ],
      };
}

export function buildHeatmapBucketConfig({
  config,
  scaleType,
  effectiveMin,
  max,
  granularity,
  nBuckets,
}: {
  config: HeatmapChartConfig;
  scaleType: HeatmapScaleType;
  effectiveMin: string | number;
  max: string | number;
  granularity: SQLInterval;
  nBuckets: number;
}): BuilderChartConfigWithDateRange {
  const valueExpression = config.select[0].valueExpression;
  const countExpression = config.select[0].countExpression?.trim() || 'count()';
  const isAggregateExpression = isAggregateFunction(valueExpression);

  const bucketExprAgg =
    scaleType === 'log'
      ? `widthBucket(log(greatest(toFloat64(value_calc), ${effectiveMin})), log(${effectiveMin}), log(${max}), ${nBuckets})`
      : `widthBucket(value_calc, ${effectiveMin}, ${max}, ${nBuckets})`;
  const bucketExprDirect =
    scaleType === 'log'
      ? `widthBucket(log(greatest(toFloat64(${valueExpression}), ${effectiveMin})), log(${effectiveMin}), log(${max}), ${nBuckets})`
      : `widthBucket(${valueExpression}, ${effectiveMin}, ${max}, ${nBuckets})`;

  return isAggregateExpression
    ? {
        ...config,
        where: '',
        select: [
          {
            valueExpression: 'sum(value_count)',
            alias: 'count',
          },
        ],
        groupBy: [
          {
            valueExpression: bucketExprAgg,
            alias: 'x_bucket',
          },
        ],
        with: [
          {
            name: 'bucket_calc',
            chartConfig: {
              ...config,
              select: [
                { valueExpression, alias: 'value_calc' },
                {
                  valueExpression: countExpression,
                  alias: 'value_count',
                },
              ],
              granularity,
              orderBy: undefined,
            },
          },
        ],
        timestampValueExpression: '__hdx_time_bucket',
        dateRange: getAlignedDateRange(config.dateRange, granularity),
        from: { databaseName: '', tableName: 'bucket_calc' },
        orderBy: [{ valueExpression: 'x_bucket', ordering: 'ASC' }],
        granularity,
      }
    : {
        ...config,
        select: [
          {
            valueExpression: countExpression,
            alias: 'count',
          },
        ],
        groupBy: [
          {
            valueExpression: bucketExprDirect,
            alias: 'x_bucket',
          },
        ],
        orderBy: [{ valueExpression: 'x_bucket', ordering: 'ASC' }],
        granularity,
      };
}
