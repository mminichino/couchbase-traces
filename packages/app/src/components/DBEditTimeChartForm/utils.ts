import z from 'zod';
import {
  TableConnection,
  TableConnectionChoice,
} from '@couchbase-traces/common-utils/dist/core/metadata';
import {
  configConsumesBroadcastFilters,
  getBlockingRequiredFilterNames,
} from '@couchbase-traces/common-utils/dist/dashboardFilterValues';
import { getSqlFilters } from '@couchbase-traces/common-utils/dist/filters';
import {
  isBuilderChartConfig,
  isPromqlChartConfig,
  isRawSqlChartConfig,
  isRawSqlSavedChartConfig,
} from '@couchbase-traces/common-utils/dist/guards';
import {
  BroadcastFilter,
  BuilderChartConfigWithDateRange,
  ChartAlertBaseSchema,
  ChartConfigWithDateRange,
  ChartConfigWithOptTimestamp,
  ChartVariable,
  DashboardFilter,
  DisplayType,
  Filter,
  SavedChartConfig,
  SelectList,
  SourceKind,
  TSource,
  validateAlertScheduleOffsetMinutes,
} from '@couchbase-traces/common-utils/dist/types';
import { filterReferencedVariables } from '@couchbase-traces/common-utils/dist/variables';

import {
  convertToCategoricalChartConfig,
  convertToNumberChartConfig,
  convertToTableChartConfig,
  convertToTimeChartConfig,
  tryExpandConfigVariables,
} from '@/ChartUtils';
import { ChartEditorFormState } from '@/components/ChartEditor/types';
import { getMinGranularitySeconds } from '@/hooks/useChartConfig';
import { getFirstTimestampValueExpression } from '@/source';
import { getMetricTableName } from '@/utils';
import {
  extendDateRangeToInterval,
  intervalToGranularity,
} from '@/utils/alerts';

export const isQueryReady = (
  queriedConfig: ChartConfigWithDateRange | undefined,
) => {
  if (!queriedConfig) return false;
  if (isPromqlChartConfig(queriedConfig)) {
    return false;
  }
  if (isRawSqlChartConfig(queriedConfig)) {
    return !!(queriedConfig.sqlTemplate && queriedConfig.connection);
  }
  return (
    ((queriedConfig.select?.length ?? 0) > 0 ||
      typeof queriedConfig.select === 'string') &&
    queriedConfig.from?.databaseName &&
    // tableName is empty for metric sources
    (queriedConfig.from?.tableName || queriedConfig.metricTables) &&
    queriedConfig.timestampValueExpression
  );
};

export const zSavedChartConfig = z
  .object({
    // TODO: Chart
    alert: ChartAlertBaseSchema.superRefine(
      validateAlertScheduleOffsetMinutes,
    ).optional(),
  })
  .passthrough();

// similar to seriesToSearchQuery from v1
export function seriesToFilters(select: SelectList): Filter[] {
  if (typeof select === 'string') {
    return [];
  }

  const filters: Filter[] = select
    .map(({ aggCondition, aggConditionLanguage }) => {
      if (
        aggConditionLanguage != null &&
        (aggConditionLanguage === 'sql' || aggConditionLanguage === 'lucene') &&
        aggCondition != null
      ) {
        return {
          type: aggConditionLanguage,
          condition: aggCondition,
        };
      } else {
        return null;
      }
    })
    .filter(f => f != null);

  return filters;
}

export function displayTypeToActiveTab(displayType: DisplayType): string {
  switch (displayType) {
    case DisplayType.Search:
      return 'search';
    case DisplayType.Markdown:
      return 'markdown';
    case DisplayType.Table:
      return 'table';
    case DisplayType.Pie:
      return 'pie';
    case DisplayType.Bar:
      return 'bar';
    case DisplayType.Number:
      return 'number';
    case DisplayType.Heatmap:
      return 'heatmap';
    case DisplayType.EventPatterns:
      return 'event_patterns';
    default:
      return 'time';
  }
}

/**
 * Whether a tab queries data. Markdown is static content, so it gets no Run
 * button, time range or dashboard filters, and no required filter can block
 * its preview — the tab-level counterpart of `displayTypeRequiresSource`.
 */
export function tabQueriesData(activeTab: string): boolean {
  return activeTab !== displayTypeToActiveTab(DisplayType.Markdown);
}

export const TABS_WITH_GENERATED_SQL = new Set([
  'table',
  'time',
  'number',
  'pie',
  'bar',
  'heatmap',
]);

export function computeDbTimeChartConfig(
  queriedConfig: ChartConfigWithDateRange | undefined,
  alert: ChartEditorFormState['alert'],
): ChartConfigWithDateRange | undefined {
  if (!queriedConfig) {
    return undefined;
  }

  return {
    ...queriedConfig,
    granularity: alert
      ? intervalToGranularity(alert.interval)
      : queriedConfig.granularity,
    dateRange: alert
      ? extendDateRangeToInterval(queriedConfig.dateRange, alert.interval)
      : queriedConfig.dateRange,
  };
}

/**
 * Returns the dashboard variables a chart preview should use, narrowed to the
 * ones the chart config references. When applySelections is false, return empty
 * selections for each variable.
 */
export function resolvePreviewVariables({
  config,
  variables,
  applySelections,
}: {
  config: ChartConfigWithDateRange;
  variables: ChartVariable[] | undefined;
  applySelections: boolean;
}): ChartVariable[] | undefined {
  if (!variables) return undefined;
  const referenced = filterReferencedVariables(config, variables);
  return applySelections
    ? referenced
    : referenced.map(variable => ({ ...variable, values: [] }));
}

/** What the dashboard's filter state contributes to a tile preview. */
export type TilePreviewFilters = {
  /** Broadcast filter conditions to query the preview with, in its query language. */
  filters: BroadcastFilter[] | undefined;
  /** The referenced variables, with or without their selections. */
  variables: ChartVariable[] | undefined;
  /** Names of the required filters that have nothing selected. */
  missingRequiredFilterNames: string[];
};

/**
 * Applies the parent dashboard's filter selections to a tile preview.
 *
 * With `applySelections` off, the preview runs as an alert would: no broadcast
 * filters, empty variable selections, and no required-filter block.
 */
export function resolveTilePreviewFilters({
  config,
  sourceId,
  filters,
  variables,
  unsatisfiedRequiredFilters,
  applySelections,
}: {
  config: ChartConfigWithDateRange;
  sourceId: string | undefined;
  filters: BroadcastFilter[] | undefined;
  variables: ChartVariable[] | undefined;
  unsatisfiedRequiredFilters: DashboardFilter[] | undefined;
  applySelections: boolean;
}): TilePreviewFilters {
  const previewVariables = resolvePreviewVariables({
    config,
    variables,
    applySelections,
  });

  if (!applySelections) {
    return {
      filters: undefined,
      variables: previewVariables,
      missingRequiredFilterNames: [],
    };
  }

  const previewFilters =
    !isPromqlChartConfig(config) &&
    configConsumesBroadcastFilters(config, sourceId) &&
    filters
      ? getSqlFilters(filters)
      : undefined;

  return {
    filters: previewFilters,
    variables: previewVariables,
    missingRequiredFilterNames: getBlockingRequiredFilterNames({
      config,
      sourceId,
      unsatisfiedRequiredFilters,
      referencedVariables: previewVariables,
    }),
  };
}

/** The config with the broadcast filters in its own query language attached. */
export function withBroadcastFilters(
  config: ChartConfigWithDateRange,
  filters: BroadcastFilter[] | undefined,
): ChartConfigWithDateRange {
  if (isPromqlChartConfig(config)) {
    return config;
  }
  return { ...config, filters: filters && getSqlFilters(filters) };
}

/** PromQL tiles were removed in Phase 10. */
export function buildRenderedPromqlExpression(
  queriedConfig: ChartConfigWithDateRange | undefined,
  _minGranularitySeconds?: number,
): undefined {
  if (queriedConfig != null && isPromqlChartConfig(queriedConfig)) {
    return undefined;
  }
  return undefined;
}

export function buildSampleEventsConfig(
  queriedConfig: ChartConfigWithDateRange | undefined,
  tableSource: TSource | undefined,
  dateRange: [Date, Date],
  queryReady: boolean,
) {
  if (
    tableSource == null ||
    queriedConfig == null ||
    !isBuilderChartConfig(queriedConfig) ||
    !queryReady
  ) {
    return null;
  }

  // The series' agg conditions become `filters` below, and `filters` is
  // deliberately not scanned for variable references. So expand the variables
  // here, building the filters in the sample events config below.
  const config = tryExpandConfigVariables(queriedConfig);

  return {
    ...config,
    orderBy: [
      {
        ordering: 'DESC' as const,
        valueExpression: getFirstTimestampValueExpression(
          tableSource.timestampValueExpression,
        ),
      },
    ],
    dateRange,
    timestampValueExpression: tableSource.timestampValueExpression,
    connection: tableSource.connection,
    from: tableSource.from,
    limit: { limit: 200 },
    select:
      ((tableSource.kind === SourceKind.Log ||
        tableSource.kind === SourceKind.Trace) &&
        tableSource.defaultTableSelectExpression) ||
      '',
    filters: seriesToFilters(config.select),
    filtersLogicalOperator: 'OR' as const,
    groupBy: undefined,
    granularity: undefined,
    having: undefined,
  };
}

type BuildChartConfigForExplanationsParams = {
  queriedConfig?: ChartConfigWithDateRange;
  queriedSourceId?: string;
  tableSource?: TSource;
  chartConfig: SavedChartConfig;
  dateRange: [Date, Date];
  activeTab: string;
  dbTimeChartConfig?: ChartConfigWithDateRange;
};

export function buildChartConfigForExplanations({
  queriedConfig,
  queriedSourceId,
  tableSource,
  chartConfig,
  dateRange,
  activeTab,
  dbTimeChartConfig,
}: BuildChartConfigForExplanationsParams):
  | ChartConfigWithOptTimestamp
  | undefined {
  if (queriedConfig && isRawSqlChartConfig(queriedConfig))
    return { ...queriedConfig, dateRange };

  if (chartConfig && isRawSqlSavedChartConfig(chartConfig))
    return { ...chartConfig, dateRange };

  const userHasSubmittedQuery = !!queriedConfig;
  const queriedSourceMatchesSelectedSource =
    queriedSourceId === tableSource?.id;
  const urlParamsSourceMatchesSelectedSource =
    chartConfig.source === tableSource?.id;

  const effectiveQueriedConfig =
    activeTab === 'time' ? dbTimeChartConfig : queriedConfig;

  const config =
    userHasSubmittedQuery && queriedSourceMatchesSelectedSource
      ? effectiveQueriedConfig
      : chartConfig && urlParamsSourceMatchesSelectedSource && tableSource
        ? {
            ...chartConfig,
            dateRange,
            timestampValueExpression: tableSource.timestampValueExpression,
            from: tableSource.from,
            connection: tableSource.connection,
          }
        : undefined;

  if (!config || !isBuilderChartConfig(config)) {
    return undefined;
  }

  // Apply the transformations that child components will apply,
  // so that the MV optimization explanation and generated SQL preview
  // are accurate.  Heatmap is special-cased: it actually runs as two
  // sequential queries (bounds + bucketed counts) that depend on each
  // other at runtime, so the SQL preview transforms `builderConfig` itself
  // into both queries on render and the MV indicator is suppressed for this
  // tab.
  const builderConfig: BuilderChartConfigWithDateRange = {
    ...config,
    minGranularitySeconds: getMinGranularitySeconds(tableSource),
  };

  if (activeTab === 'time') {
    return convertToTimeChartConfig(builderConfig);
  } else if (activeTab === 'number') {
    return convertToNumberChartConfig(builderConfig);
  } else if (activeTab === 'table') {
    return convertToTableChartConfig(builderConfig);
  } else if (activeTab === 'pie' || activeTab === 'bar') {
    return convertToCategoricalChartConfig(builderConfig);
  } else if (activeTab === 'heatmap') {
    return builderConfig;
  }

  return config;
}

/**
 * Picks the table connection(s) that drive attribute autocomplete for the
 * chart-level Group By.
 *
 * Metric sources have no single `from.tableName` (they fan out to per-type
 * metric tables), so we build one connection per series' metric table + name
 * (deduped) and ask the editor to offer only fields present in ALL of them
 * (`intersectFields`). A ratio can mix metric types (e.g. gauge / sum) whose
 * tables have different native columns — a union would suggest a column that
 * only exists in one series and make the other series' query fail, so the Group
 * By must be restricted to fields valid for every series.
 *
 * Non-metric sources (and metric sources with no resolvable series) fall back
 * to the source's single `tableConnection`.
 */
export function buildGroupByConnectionProps({
  tableSource,
  series,
  tableConnection,
}: {
  tableSource: TSource | undefined;
  series: { metricType?: string; metricName?: string }[] | undefined;
  tableConnection: TableConnection;
}): TableConnectionChoice & { intersectFields?: boolean } {
  if (tableSource?.kind !== SourceKind.Metric || !Array.isArray(series)) {
    return { tableConnection };
  }

  const seen = new Set<string>();
  const connections: TableConnection[] = [];
  for (const s of series) {
    if (!s?.metricType || !s?.metricName) continue;
    const metricTable = getMetricTableName(tableSource, s.metricType);
    if (!metricTable) continue;
    const key = `${metricTable}::${s.metricName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    connections.push({
      databaseName: tableSource.from.databaseName,
      tableName: metricTable,
      connectionId: tableSource.connection,
      metricName: s.metricName,
    });
  }

  return connections.length > 0
    ? { tableConnections: connections, intersectFields: true }
    : { tableConnection };
}
