import type { DashboardSchema } from '@couchbase-traces/common-utils/dist/types';
import { z } from 'zod';

import type { Id } from '@/metadata/ids';
import { IsoDate } from '@/metadata/schemas/common';

/**
 * `dashboards/<id>`. The array fields keep the empty default Mongoose gave
 * them, because clients read `containers` and `savedFilterValues` as arrays.
 */
export const DashboardDocSchema = z.object({
  team: z.string(),
  name: z.string(),
  tiles: z.array(z.unknown()),
  tags: z.array(z.string()).default([]),
  filters: z.array(z.unknown()).default([]),
  savedQuery: z.string().nullish(),
  savedQueryLanguage: z.string().nullish(),
  savedFilterValues: z.array(z.unknown()).default([]),
  savedDateRange: z.unknown().optional(),
  containers: z.array(z.unknown()).default([]),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
  provisioned: z.boolean().default(false),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});

export type DashboardDoc = z.infer<typeof DashboardDocSchema>;

type DashboardShape = Omit<z.infer<typeof DashboardSchema>, 'id'>;

export interface IDashboard extends DashboardShape {
  _id: Id;
  id: Id;
  team: Id;
  createdBy?: Id;
  updatedBy?: Id;
  provisioned: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type DashboardInput = DashboardShape;
export type DashboardPatch = Partial<DashboardShape>;
