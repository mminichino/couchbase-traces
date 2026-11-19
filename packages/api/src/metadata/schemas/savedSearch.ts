import type { SavedSearchSchema } from '@couchbase-traces/common-utils/dist/types';
import { z } from 'zod';

import type { Id } from '@/metadata/ids';
import { IsoDate } from '@/metadata/schemas/common';

/**
 * `saved_searches/<id>`. `source` is a string id (it was an ObjectId in
 * Mongo), and `tags` / `filters` keep the empty-array default Mongoose gave.
 */
export const SavedSearchDocSchema = z.object({
  team: z.string(),
  name: z.string().optional(),
  select: z.string().optional(),
  where: z.string().optional(),
  whereLanguage: z.string().optional(),
  orderBy: z.string().optional(),
  source: z.string(),
  tags: z.array(z.string()).default([]),
  filters: z.array(z.unknown()).default([]),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});

export type SavedSearchDoc = z.infer<typeof SavedSearchDocSchema>;

type SavedSearchShape = Omit<
  z.infer<typeof SavedSearchSchema>,
  'id' | 'alerts'
>;

export interface ISavedSearch extends SavedSearchShape {
  _id: Id;
  id: Id;
  team: Id;
  createdBy?: Id;
  updatedBy?: Id;
  createdAt: Date;
  updatedAt: Date;
}

export type SavedSearchInput = Partial<SavedSearchShape> & { source: Id };
export type SavedSearchPatch = Partial<SavedSearchShape>;

export type ExternalSavedSearch = {
  id: string;
  name: string;
  select?: string;
  where?: string;
  whereLanguage?: string;
  orderBy?: string;
  sourceId?: string;
  tags?: string[];
  filters?: unknown[];
  teamId: string;
  createdAt?: string;
  updatedAt?: string;
};

/** The external API v2 and MCP shape (was the model's `toExternalJSON`). */
export function toExternalSavedSearch(s: ISavedSearch): ExternalSavedSearch {
  return {
    id: s._id,
    name: s.name ?? '',
    select: s.select,
    where: s.where,
    whereLanguage: s.whereLanguage,
    orderBy: s.orderBy,
    sourceId: s.source || undefined,
    tags: s.tags,
    filters: s.filters,
    teamId: s.team,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
  };
}
