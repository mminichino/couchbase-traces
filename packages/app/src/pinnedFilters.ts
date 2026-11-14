import type { PinnedFiltersValue } from '@couchbase-traces/common-utils/dist/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { hdxServer } from './api';

type PinnedFiltersApiResponse = {
  team: { id: string; fields: string[]; filters: PinnedFiltersValue } | null;
};

function pinnedFiltersQueryKey(sourceId: string | null) {
  return ['pinned-filters', sourceId];
}

async function fetchPinnedFilters(
  sourceId: string,
): Promise<PinnedFiltersApiResponse> {
  return hdxServer(`pinned-filters?source=${sourceId}`).json();
}

export function usePinnedFiltersApi(sourceId: string | null) {
  return useQuery({
    queryKey: pinnedFiltersQueryKey(sourceId),
    queryFn: () => fetchPinnedFilters(sourceId!),
    enabled: !!sourceId,
  });
}

type UpdatePinnedFiltersInput = {
  source: string;
  fields: string[];
  filters: PinnedFiltersValue;
};

export function useUpdatePinnedFilters() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdatePinnedFiltersInput) =>
      hdxServer('pinned-filters', {
        method: 'PUT',
        json: data,
      }).json(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: pinnedFiltersQueryKey(variables.source),
      });
    },
  });
}
