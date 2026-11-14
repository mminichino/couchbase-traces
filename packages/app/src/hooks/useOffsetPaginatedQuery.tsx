import { useMemo } from 'react';
import { isEqual, omit } from 'lodash';
import ms from 'ms';
import { Metadata } from '@couchbase-traces/common-utils/dist/core/metadata';
import {
  isFirstOrderByAscending,
  isTimestampExpressionInFirstOrderBy,
} from '@couchbase-traces/common-utils/dist/core/utils';
import { renderChartConfig } from '@couchbase-traces/common-utils/dist/dataLayer';
import {
  isBuilderChartConfig,
  isRawSqlChartConfig,
} from '@couchbase-traces/common-utils/dist/guards';
import type { ResponseJSON } from '@couchbase-traces/common-utils/dist/query';
import {
  ColumnMetaType,
  type QueryAttribution,
  QueryError,
  SqlFrag,
} from '@couchbase-traces/common-utils/dist/query';
import {
  ChartConfigWithOptTimestamp,
  TSource,
} from '@couchbase-traces/common-utils/dist/types';
import {
  QueryClient,
  QueryFunction,
  useInfiniteQuery,
  useQueryClient,
} from '@tanstack/react-query';

import api from '@/api';
import { useMetadataWithSettings } from '@/hooks/useMetadata';
import { useMVOptimizationExplanation } from '@/hooks/useMVOptimizationExplanation';
import { getDataClient } from '@/query';
import { useQueryAttribution } from '@/queryAttribution';
import { useSource } from '@/source';
import {
  DEFAULT_TIME_WINDOWS_SECONDS,
  generateTimeWindowsAscending,
  generateTimeWindowsDescending,
  ONE_MIN_WINDOW,
  TimeWindow,
} from '@/utils/searchWindows';

type TQueryKey = readonly [
  string,
  ChartConfigWithOptTimestamp,
  number | undefined,
];

function queryKeyFn(
  prefix: string,
  config: ChartConfigWithOptTimestamp,
  queryTimeout?: number,
): TQueryKey {
  return [prefix, config, queryTimeout];
}

// True when two keys describe the same query over a different time range,
// e.g. a dashboard refresh.
function differsOnlyInDateRange(a: TQueryKey, b: TQueryKey) {
  return (
    a[0] === b[0] &&
    a[2] === b[2] &&
    isEqual(omit(a[1], ['dateRange']), omit(b[1], ['dateRange']))
  );
}

type TPageParam = {
  windowIndex: number;
  offset: number;
};

type TQueryFnData = {
  data: Record<string, any>[];
  meta: ColumnMetaType[];
  sqlExpr: SqlFrag;
  window: TimeWindow;
};

type TData = {
  pages: TQueryFnData[];
  pageParams: TPageParam[];
};

type QueryMeta = {
  queryClient: QueryClient;
  hasPreviousQueries: boolean;
  windowDurationsSeconds: number[];
  metadata: Metadata;
  optimizedConfig?: ChartConfigWithOptTimestamp;
  source: TSource | undefined;
  /**
   * Read during render and carried here because the queryFn runs outside
   * React and cannot read context. `meta` rather than `queryKey`, which would
   * split the cache per surface.
   */
  attribution: QueryAttribution;
};

// Get time window from page param
function getTimeWindowFromPageParam(
  config: ChartConfigWithOptTimestamp,
  pageParam: TPageParam,
  windowDurationsSeconds: number[],
): TimeWindow {
  const [startDate, endDate] = config.dateRange;
  const windows =
    isBuilderChartConfig(config) && isFirstOrderByAscending(config.orderBy)
      ? generateTimeWindowsAscending(startDate, endDate, windowDurationsSeconds)
      : generateTimeWindowsDescending(
          startDate,
          endDate,
          windowDurationsSeconds,
        );
  const window = windows[pageParam.windowIndex];
  if (window == null) {
    throw new Error('Invalid time window for page param');
  }
  return window;
}

// Calculate next page param based on current results and window
function getNextPageParam(
  lastPage: TQueryFnData | null,
  allPages: TQueryFnData[],
  config: ChartConfigWithOptTimestamp,
  windowDurationsSeconds: number[],
): TPageParam | undefined {
  // Pagination is not supported for raw SQL or PromQL tables since they may not be ordered at all.
  if (lastPage == null || isRawSqlChartConfig(config)) {
    return undefined;
  }

  const [startDate, endDate] = config.dateRange;
  const windows = isFirstOrderByAscending(config.orderBy)
    ? generateTimeWindowsAscending(startDate, endDate, windowDurationsSeconds)
    : generateTimeWindowsDescending(startDate, endDate, windowDurationsSeconds);
  const currentWindow = lastPage.window;

  // Calculate total results from all pages in current window
  const currentWindowPages = allPages.filter(
    p => p.window.windowIndex === currentWindow.windowIndex,
  );
  const currentWindowResults = currentWindowPages.reduce(
    (sum, page) => sum + page.data.length,
    0,
  );

  // If we have results in the current window, continue paginating within it
  if (lastPage.data.length > 0) {
    return {
      windowIndex: currentWindow.windowIndex,
      offset: currentWindowResults,
    };
  }

  // If no more results in current window, move to next window (if windowing is being used)
  const shouldUseWindowing =
    isBuilderChartConfig(config) && isTimestampExpressionInFirstOrderBy(config);
  const nextWindowIndex = currentWindow.windowIndex + 1;
  if (shouldUseWindowing && nextWindowIndex < windows.length) {
    return {
      windowIndex: nextWindowIndex,
      offset: 0,
    };
  }

  return undefined;
}

const queryFn: QueryFunction<TQueryFnData, TQueryKey, TPageParam> = async ({
  queryKey,
  pageParam,
  signal,
  meta,
}) => {
  if (meta == null) {
    throw new Error('Query missing client meta');
  }

  const {
    windowDurationsSeconds,
    metadata,
    optimizedConfig,
    source,
    attribution,
  } = meta as QueryMeta;

  const queryTimeout = queryKey[2];
  const dataClient = getDataClient({
    requestTimeout: queryTimeout,
    attribution,
  });

  const rawConfig = queryKey[1];
  const config = optimizedConfig ?? rawConfig;

  // Get the time window for this page
  const shouldUseWindowing =
    isBuilderChartConfig(config) && isTimestampExpressionInFirstOrderBy(config);
  const timeWindow = shouldUseWindowing
    ? getTimeWindowFromPageParam(config, pageParam, windowDurationsSeconds)
    : {
        startTime: config.dateRange[0],
        endTime: config.dateRange[1],
        windowIndex: 0,
        direction: 'DESC' as const,
      };

  // PromQL goes to the Prometheus API route rather than legacy store, and never
  // paginates (see getNextPageParam), so it answers in a single page.

  // Create config with windowed date range
  const windowedConfig = isBuilderChartConfig(config)
    ? {
        ...config,
        dateRange: [timeWindow.startTime, timeWindow.endTime] as [Date, Date],
        limit: {
          limit: config.limit?.limit,
          offset: pageParam.offset,
        },
      }
    : config;

  const query = await renderChartConfig(
    windowedConfig,
    metadata,
    source?.querySettings,
  );

  // Create abort signal from timeout if provided
  const abortController = queryTimeout ? new AbortController() : undefined;
  if (abortController && queryTimeout) {
    setTimeout(() => abortController.abort(), queryTimeout * 1000);
  }

  const resultSet = await dataClient.query<'JSON'>({
    query: query.sql,
    query_params: query.params,
    format: 'JSON',
    abort_signal: abortController?.signal || signal,
    connectionId: config.connection,
  });

  const json = await resultSet.json<ResponseJSON<Record<string, unknown>>>();
  return {
    data: json.data ?? [],
    meta: json.meta ?? [],
    sqlExpr: query,
    window: timeWindow,
  };
};

function flattenPages(pages: TQueryFnData[]) {
  return pages.flatMap(p => p.data);
}

function flattenData(data: TData | undefined): TQueryFnData | null {
  if (data == null || data.pages.length === 0) {
    return null;
  }

  return {
    meta: data.pages[0].meta,
    data: flattenPages(data.pages),
    sqlExpr: data.pages[0].sqlExpr,
    window: data.pages[data.pages.length - 1].window,
  };
}

export default function useOffsetPaginatedQuery(
  config: ChartConfigWithOptTimestamp,
  {
    isLive,
    keepPreviousData,
    enabled = true,
    queryKeyPrefix = '',
    enableSmallFirstWindow,
  }: {
    isLive?: boolean;
    /** Keep showing the previous result while the same query loads a new date range */
    keepPreviousData?: boolean;
    enabled?: boolean;
    queryKeyPrefix?: string;
    enableSmallFirstWindow?: boolean;
  } = {},
) {
  const { data: meData, isLoading: isLoadingMe } = api.useMe();
  const key = queryKeyFn(queryKeyPrefix, config, meData?.team?.queryTimeout);
  const queryClient = useQueryClient();
  const metadata = useMetadataWithSettings();
  const attribution = useQueryAttribution();
  const matchedQueries = queryClient.getQueriesData<TData>({
    queryKey: [queryKeyPrefix, omit(config, ['dateRange'])],
  });
  // TODO: Check that the time ranges overlap
  const hasPreviousQueries =
    matchedQueries.filter(([_, data]) => data != null).length > 0;

  const windowDurationsSeconds = DEFAULT_TIME_WINDOWS_SECONDS.slice();
  if (enableSmallFirstWindow) {
    windowDurationsSeconds.unshift(ONE_MIN_WINDOW);
  }

  const builderConfig = isBuilderChartConfig(config) ? config : undefined;
  const { data: mvOptimizationData, isLoading: isLoadingMVOptimization } =
    useMVOptimizationExplanation(builderConfig, {
      enabled: !!enabled && !!builderConfig,
    });

  const { data: source, isLoading: isSourceLoading } = useSource({
    id: config.source,
  });

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isError,
    error,
    isLoading,
    isPlaceholderData,
  } = useInfiniteQuery<
    TQueryFnData,
    Error | QueryError,
    TData,
    TQueryKey,
    TPageParam
  >({
    queryKey: key,
    placeholderData: (prev: TData | undefined, prevQuery) => {
      // Only preserve previous query in live mode, or when the caller asks
      // and only the date range changed. Rows from a different config would
      // be rendered with the new config's columns and formats.
      if (isLive) return prev;
      return keepPreviousData &&
        prevQuery != null &&
        differsOnlyInDateRange(prevQuery.queryKey, key)
        ? prev
        : undefined;
    },
    enabled:
      enabled && !isLoadingMe && !isLoadingMVOptimization && !isSourceLoading,
    initialPageParam: { windowIndex: 0, offset: 0 } as TPageParam,
    getNextPageParam: (lastPage, allPages) => {
      return getNextPageParam(
        lastPage,
        allPages,
        config,
        windowDurationsSeconds,
      );
    },
    staleTime: Infinity, // TODO: Pick a correct time
    meta: {
      queryClient,
      hasPreviousQueries,
      windowDurationsSeconds,
      metadata,
      optimizedConfig: mvOptimizationData?.optimizedConfig as
        | ChartConfigWithOptTimestamp
        | undefined,
      source,
      attribution,
    } satisfies QueryMeta,
    queryFn,
    gcTime: isLive ? ms('30s') : ms('5m'), // more aggressive gc for live data, since it can end up holding lots of data
    retry: 1,
    refetchOnWindowFocus: false,
    maxPages: isLive ? 5 : undefined, // Limit number of pages kept in cache for live data
  });

  const flattenedData = useMemo(() => flattenData(data), [data]);

  return {
    isError,
    error,
    data: flattenedData,
    fetchNextPage,
    hasNextPage,
    isFetching: isFetching || isLoadingMe || isLoadingMVOptimization,
    isLoading: isLoading || isLoadingMe || isLoadingMVOptimization,
    isPlaceholderData,
  };
}
