import type { BuilderChartConfigWithDateRange } from '@couchbase-traces/common-utils/dist/types';

import type { HeatmapData } from './useHeatmapView';

const EMPTY_GRID = {
  times: [] as number[],
  stepMs: 0,
  yAxis: { type: 'numeric' as const, scale: 'linear' as const, edges: [0, 1] },
  cells: [] as number[],
};

const EMPTY_HEATMAP: HeatmapData = {
  view: {
    grid: EMPTY_GRID,
    generatedTsBuckets: [],
    scaleType: 'linear',
    effectiveMin: 0,
    hiddenSeriesCount: 0,
  },
  isLoading: false,
  isRefreshing: false,
  error: new Error('PromQL histogram heatmaps are no longer supported'),
};

/** @deprecated PromQL histogram heatmaps removed in Phase 10. */
export function useHistogramHeatmapData(_args: {
  config: BuilderChartConfigWithDateRange;
  enabled: boolean;
}): HeatmapData {
  return EMPTY_HEATMAP;
}
