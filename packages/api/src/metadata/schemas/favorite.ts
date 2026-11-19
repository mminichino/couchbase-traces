import { z } from 'zod';

import type { Id } from '@/metadata/ids';
import { IsoDate } from '@/metadata/schemas/common';

export const FAVORITE_TYPES = ['dashboard', 'savedSearch'] as const;
export type FavoriteType = (typeof FAVORITE_TYPES)[number];

/** `favorites/<id>`; one per (team, user, resourceType, resourceId). */
export const FavoriteDocSchema = z.object({
  user: z.string(),
  team: z.string(),
  resourceType: z.enum(FAVORITE_TYPES),
  resourceId: z.string(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});

export type FavoriteDoc = z.infer<typeof FavoriteDocSchema>;

export interface IFavorite {
  _id: Id;
  id: Id;
  user: Id;
  team: Id;
  resourceType: FavoriteType;
  resourceId: string;
  createdAt: Date;
  updatedAt: Date;
}
