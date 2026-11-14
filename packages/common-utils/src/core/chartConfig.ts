import type {
  BuilderChartConfigWithDateRange,
  BuilderChartConfigWithOptDateRange,
  DateRange,
  RawSqlChartConfig,
  SelectList,
  SqlAstFilter,
} from '@/types';
import { MetricsDataType } from '@/types';
export const FIXED_TIME_BUCKET_EXPR_ALIAS = '__hdx_time_bucket';

// Maximum number of distinct groups shown in a time chart when using 'increase' with a groupBy.
const _INCREASE_MAX_NUM_GROUPS = 20;

export function isUsingGroupBy(
  chartConfig: BuilderChartConfigWithOptDateRange,
): chartConfig is Omit<BuilderChartConfigWithDateRange, 'groupBy'> & {
  groupBy: NonNullable<BuilderChartConfigWithDateRange['groupBy']>;
} {
  return chartConfig.groupBy != null && chartConfig.groupBy.length > 0;
}

export function isUsingGranularity<
  T extends BuilderChartConfigWithOptDateRange,
>(
  chartConfig: T,
): chartConfig is T &
  Omit<
    Omit<Omit<BuilderChartConfigWithDateRange, 'granularity'>, 'dateRange'>,
    'timestampValueExpression'
  > & {
    granularity: NonNullable<BuilderChartConfigWithDateRange['granularity']>;
    dateRange: NonNullable<BuilderChartConfigWithDateRange['dateRange']>;
    timestampValueExpression: NonNullable<
      BuilderChartConfigWithDateRange['timestampValueExpression']
    >;
  } {
  return (
    chartConfig.timestampValueExpression != null &&
    chartConfig.granularity != null
  );
}

export const isMetricChartConfig = (
  chartConfig: BuilderChartConfigWithOptDateRange,
): chartConfig is BuilderChartConfigWithOptDateRange & {
  metricTables: NonNullable<BuilderChartConfigWithOptDateRange['metricTables']>;
} => {
  return chartConfig.metricTables != null;
};

/** Whether the config carries at least one metric formula. */
export const hasMetricFormulas = (
  chartConfig: BuilderChartConfigWithOptDateRange,
): boolean => (chartConfig.formulas?.length ?? 0) > 0;

// TODO: apply this to all chart configs
export const setChartSelectsAlias = (
  config: BuilderChartConfigWithOptDateRange,
) => {
  if (Array.isArray(config.select) && isMetricChartConfig(config)) {
    return {
      ...config,
      select: config.select.map(s => ({
        ...s,
        alias:
          s.alias ||
          (s.aggFn === 'increase'
            ? `increase(${s.metricName})`
            : s.isDelta
              ? `${s.aggFn}(delta(${s.metricName}))`
              : `${s.aggFn}(${s.metricName})`), // use an alias if one isn't already set
      })),
    };
  }
  return config;
};

// Internal aliases used to compose a multi-series metric query. Every
// per-series branch projects its VALUE under this fixed name (and is tagged
// with its series index) so the outer pivot can reference them. Group-by and
// time-bucket columns deliberately keep their natural single-series names —
// consumers look rows up by ClickHouse's derived column names, which can't
// be reproduced node-side (see renderMultiSeriesMetricChartConfig).
const _MULTI_SERIES_VALUE_ALIAS = '__hdx_value';
const _MULTI_SERIES_IDX_ALIAS = '__hdx_series_idx';
// Prefix for internal sort-key companion columns. When the user's ORDER BY
// references a group-by *expression* (e.g. ResourceAttributes['service.name']),
// the outer composed query can't evaluate it — the source columns don't exist
// there and the passthrough column's ClickHouse-derived name is unknowable
// node-side. Each such expression is instead projected once more in every
// scalar branch under `__hdx_sort_<n>`, excluded from the output via
// * EXCEPT, and referenced from the outer ORDER BY through
// any(`__hdx_sort_<n>`) (see renderMultiSeriesOrderBy).
const _MULTI_SERIES_SORT_ALIAS_PREFIX = '__hdx_sort_';

/**
 * Render a user-facing output column name as a ClickHouse double-quoted
 * identifier. User aliases (and metric names, which flow into the default
 * aliases) can contain double quotes; ClickHouse escapes them by doubling,
 * so `bad"name` becomes "bad""name" instead of terminating the identifier
 * early. Escaping happens only at SQL-emission time — collision dedup and
 * the meta column names consumers see keep the raw name.
 */
const _quotedColumnName = (name: string) => `"${name.replace(/"/g, '""')}"`;

// Histogram translations bake the group-by dimensions into a single Array
// column named GROUP_ALIAS instead of projecting them as individual columns
// (see translateHistogram), so grouped histogram rows never share a merge key
// with grouped gauge/sum rows.
export const isHistogramClassSelect = (select: {
  metricType?: MetricsDataType;
}): boolean =>
  select.metricType === MetricsDataType.Histogram ||
  select.metricType === MetricsDataType.ExponentialHistogram;

/**
 * Merge per-branch trailing SETTINGS clauses into one deduped item list for
 * the composed query. ClickHouse rejects SETTINGS on a UNION ALL branch that
 * is followed by further branches, so the clauses are stripped from each
 * branch and hoisted here. Known settings (translate-injected internals plus
 * source querySettings) are simple `key = value` pairs without commas.
 */
function _mergeSettingsClauses(clauses: (string | undefined)[]): string {
  const items: string[] = [];
  const seen = new Set<string>();
  for (const clause of clauses) {
    if (!clause) {
      continue;
    }
    const body = clause.replace(/^settings\s*/i, '');
    for (const rawItem of body.split(',')) {
      const item = rawItem.trim();
      if (item !== '' && !seen.has(item)) {
        seen.add(item);
        items.push(item);
      }
    }
  }
  return items.join(', ');
}

const INVERSE_OPERATOR_MAP = {
  '=': '!=',
  '>': '<=',
  '<': '>=',

  '!=': '=',
  '<=': '>',
  '>=': '<',
} as const;
export function inverseSqlAstFilter(filter: SqlAstFilter): SqlAstFilter {
  return {
    ...filter,
    operator:
      INVERSE_OPERATOR_MAP[
        filter.operator as keyof typeof INVERSE_OPERATOR_MAP
      ],
  };
}

export function isNonEmptyWhereExpr(where?: string): where is string {
  return where != null && where.trim() != '';
}
export function isRatioChartConfig(
  selectList: SelectList,
  chartConfig: BuilderChartConfigWithOptDateRangeEx,
): boolean {
  return chartConfig.seriesReturnType === 'ratio' && selectList.length === 2;
}
type InternalChartFields = {
  includedDataInterval?: string;
  settings?: { sql: string; params: Record<string, unknown> };
  /**
   * Pre-resolved single column from the (possibly multi-column)
   * `timestampValueExpression`, used for the time-bucket and time-math
   * expressions only. Resolved once at the top of `renderChartConfig` via
   * `pickBucketTimestampColumn` so the bucket isn't pinned to a Date-typed
   * partition column when a higher-precision DateTime column is also listed.
   *
   * Closes HDX-4371. The WHERE clause keeps using the multi-column form so
   * partition pruning via the Date column continues to work.
   */
  bucketTimestampValueExpression?: string;
  /**
   * Emit raw-SQL-template macros ($__fromTime_ms, $__toTime_ms,
   * $__timeInterval, $__sourceTable, $__filters) instead of bound
   * date/interval/table values, so the result can be used as an editable
   * `sqlTemplate`.
   */
  isRenderingRawSqlTemplate?: boolean;
};

type BuilderChartConfigWithOptDateRangeEx = BuilderChartConfigWithOptDateRange &
  InternalChartFields;

type RawSqlChartConfigEx = RawSqlChartConfig &
  Partial<DateRange> &
  InternalChartFields;

export type ChartConfigWithOptDateRangeEx =
  | BuilderChartConfigWithOptDateRangeEx
  | RawSqlChartConfigEx;
