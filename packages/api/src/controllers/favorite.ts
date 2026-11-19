import { getMetadataStore } from '@/metadata';
import type { IFavorite } from '@/metadata/schemas/favorite';

export function getFavorites(userId: string, teamId: string) {
  return getMetadataStore().favorites.listForUser(teamId, userId);
}

export function addFavorite(
  userId: string,
  teamId: string,
  resourceType: IFavorite['resourceType'],
  resourceId: string,
) {
  return getMetadataStore().favorites.add(
    teamId,
    userId,
    resourceType,
    resourceId,
  );
}

export function removeFavorite(
  userId: string,
  teamId: string,
  resourceType: IFavorite['resourceType'],
  resourceId: string,
) {
  return getMetadataStore().favorites.remove(
    teamId,
    userId,
    resourceType,
    resourceId,
  );
}
