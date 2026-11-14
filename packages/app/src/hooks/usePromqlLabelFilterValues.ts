import type { ChartVariable } from '@couchbase-traces/common-utils/dist/types';
import type { PromqlLabelDashboardFilter } from '@couchbase-traces/common-utils/dist/types';

/** Legacy PromQL label filters are not supported in Couchbase Traces. */
export function usePromqlLabelFilterValues({
  filters,
}: {
  filters: PromqlLabelDashboardFilter[];
  dateRange?: [Date, Date];
  variables?: ChartVariable[];
}) {
  const data = new Map<string, { values: string[]; isLoading: boolean }>();
  const erroredFilterIds = new Set(filters.map(f => f.id));
  const filterErrorMessages = new Map(
    filters.map(f => [f.id, 'PromQL label filters are no longer supported.']),
  );
  for (const filter of filters) {
    data.set(filter.id, { values: [], isLoading: false });
  }
  return {
    data,
    erroredFilterIds,
    filterErrorMessages,
    isLoading: false,
    isFetching: false,
    isError: filters.length > 0,
  };
}
