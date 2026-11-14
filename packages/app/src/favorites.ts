import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { hdxServer } from './api';

export type Favorite = {
  id: string;
  resourceType: 'dashboard' | 'savedSearch';
  resourceId: string;
};

async function fetchFavorites(): Promise<Favorite[]> {
  return hdxServer('favorites').json<Favorite[]>();
}

export function useFavorites() {
  return useQuery({
    queryKey: ['favorites'],
    queryFn: fetchFavorites,
    staleTime: 5_000,
  });
}

function useAddFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['favorites'],
    mutationFn: (data: {
      resourceType: Favorite['resourceType'];
      resourceId: string;
    }) =>
      hdxServer('favorites', {
        method: 'PUT',
        json: data,
      }).json<Favorite>(),
    onMutate: async data => {
      await queryClient.cancelQueries({ queryKey: ['favorites'] });
      const previous = queryClient.getQueryData<Favorite[]>(['favorites']);
      queryClient.setQueryData<Favorite[]>(['favorites'], old => [
        ...(old ?? []),
        { id: `optimistic-${Math.random().toString(36).slice(2)}`, ...data },
      ]);
      return { previous };
    },
    onError: (_err, _data, context) => {
      if (context !== undefined) {
        queryClient.setQueryData(['favorites'], context.previous);
      }
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: ['favorites'] }) === 1) {
        queryClient.invalidateQueries({ queryKey: ['favorites'] });
      }
    },
  });
}

function useRemoveFavorite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ['favorites'],
    mutationFn: (data: {
      resourceType: Favorite['resourceType'];
      resourceId: string;
    }) =>
      hdxServer(`favorites/${data.resourceType}/${data.resourceId}`, {
        method: 'DELETE',
      }).json<void>(),
    onMutate: async data => {
      await queryClient.cancelQueries({ queryKey: ['favorites'] });
      const previous = queryClient.getQueryData<Favorite[]>(['favorites']);
      queryClient.setQueryData<Favorite[]>(['favorites'], old =>
        (old ?? []).filter(
          f =>
            !(
              f.resourceType === data.resourceType &&
              f.resourceId === data.resourceId
            ),
        ),
      );
      return { previous };
    },
    onError: (_err, _data, context) => {
      if (context !== undefined) {
        queryClient.setQueryData(['favorites'], context.previous);
      }
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey: ['favorites'] }) === 1) {
        queryClient.invalidateQueries({ queryKey: ['favorites'] });
      }
    },
  });
}

export function useToggleFavorite(
  resourceType: Favorite['resourceType'],
  resourceId: string,
) {
  const { data: favorites } = useFavorites();
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();

  const isFavorited =
    favorites?.some(
      f => f.resourceType === resourceType && f.resourceId === resourceId,
    ) ?? false;

  const toggleFavorite = () => {
    if (isFavorited) {
      removeFavorite.mutate({ resourceType, resourceId });
    } else {
      addFavorite.mutate({ resourceType, resourceId });
    }
  };

  return { isFavorited, toggleFavorite };
}
