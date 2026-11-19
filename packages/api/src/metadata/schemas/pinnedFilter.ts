import type { PinnedFiltersValue } from '@couchbase-traces/common-utils/dist/types';
import { z } from 'zod';

import type { Id } from '@/metadata/ids';
import { IsoDate } from '@/metadata/schemas/common';

/**
 * `pinned_filters/pin::<team>::<source>`. The key is the (team, source)
 * constraint, so the wire `id` rides in the body (24-hex like every other id).
 */
export const PinnedFilterDocSchema = z.object({
  id: z.string(),
  team: z.string(),
  source: z.string(),
  fields: z.array(z.string()).default([]),
  filters: z.record(z.array(z.union([z.string(), z.boolean()]))).default({}),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});

export type PinnedFilterDoc = z.infer<typeof PinnedFilterDocSchema>;

export interface IPinnedFilter {
  _id: Id;
  id: Id;
  team: Id;
  source: Id;
  fields: string[];
  filters: PinnedFiltersValue;
  createdAt: Date;
  updatedAt: Date;
}
