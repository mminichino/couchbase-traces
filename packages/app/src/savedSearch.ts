import {
  SavedSearch,
  SavedSearchListApiResponse,
} from '@couchbase-traces/common-utils/dist/types';
import {
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryOptions,
} from '@tanstack/react-query';

import { hdxServer, useInvalidateTags } from './api';

async function fetchSavedSearches(): Promise<SavedSearchListApiResponse[]> {
  return hdxServer('saved-search').json<SavedSearchListApiResponse[]>();
}

export function useSavedSearches() {
  return useQuery({
    queryKey: ['saved-search'],
    queryFn: fetchSavedSearches,
  });
}

export function useSavedSearch(
  { id }: { id: string },
  options: Omit<
    Partial<UseQueryOptions<SavedSearchListApiResponse[], Error>>,
    'select'
  > = {},
) {
  return useQuery({
    queryKey: ['saved-search'],
    queryFn: fetchSavedSearches,
    select: data => data.find(s => s.id === id),
    ...options,
  });
}

export function useCreateSavedSearch() {
  const queryClient = useQueryClient();
  const invalidateTags = useInvalidateTags();

  return useMutation({
    mutationFn: (data: Omit<SavedSearch, 'id'>) =>
      hdxServer('saved-search', {
        method: 'POST',
        json: data,
      }).json<SavedSearch>(),
    onSuccess: () => {
      invalidateTags();
      return queryClient.invalidateQueries({ queryKey: ['saved-search'] });
    },
  });
}

export function useUpdateSavedSearch() {
  const queryClient = useQueryClient();
  const invalidateTags = useInvalidateTags();

  return useMutation({
    mutationFn: (data: Partial<SavedSearch> & { id: SavedSearch['id'] }) =>
      hdxServer(`saved-search/${data.id}`, {
        method: 'PATCH',
        json: data,
      }).json<SavedSearch>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-search'] });
      invalidateTags();
    },
  });
}

export function useDeleteSavedSearch() {
  const queryClient = useQueryClient();
  const invalidateTags = useInvalidateTags();

  return useMutation({
    mutationFn: (id: string) =>
      hdxServer(`saved-search/${id}`, { method: 'DELETE' }).json<void>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-search'] });
      invalidateTags();
    },
  });
}
