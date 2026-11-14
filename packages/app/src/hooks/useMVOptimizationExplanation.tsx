import type { BuilderChartConfigWithOptDateRange } from '@couchbase-traces/common-utils/dist/types';

/** Materialized view configuration was removed in Phase 10. */
export type MVOptimizationExplanationResult = {
  optimizedConfig?: BuilderChartConfigWithOptDateRange;
  explanation?: string;
  explanations?: {
    success?: boolean;
    message: string;
    mvConfig?: { minGranularity?: string };
  }[];
};

export function useMVOptimizationExplanation(
  _config: BuilderChartConfigWithOptDateRange | undefined,
  _options?: { enabled?: boolean },
): { data: MVOptimizationExplanationResult | undefined; isLoading: boolean } {
  return { data: undefined, isLoading: false };
}
