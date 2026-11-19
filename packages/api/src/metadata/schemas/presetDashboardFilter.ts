import {
  DashboardFilterType,
  MetricsDataType,
  PresetDashboard,
  type PresetDashboardFilter,
} from '@couchbase-traces/common-utils/dist/types';
import { z } from 'zod';

import type { Id } from '@/metadata/ids';
import { IsoDate } from '@/metadata/schemas/common';

/**
 * `preset_dashboard_filters/<id>`. Strict on purpose: only the fields the
 * Mongoose schema declared persist, so a client's extra keys never land.
 */
export const PresetDashboardFilterDocSchema = z.object({
  name: z.string(),
  team: z.string(),
  source: z.string(),
  sourceMetricType: z.nativeEnum(MetricsDataType).optional(),
  presetDashboard: z.nativeEnum(PresetDashboard),
  type: z.literal(DashboardFilterType.enum.QUERY_EXPRESSION),
  expression: z.string(),
  where: z.string().optional(),
  whereLanguage: z.enum(['sql', 'lucene']).optional(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});

export type PresetDashboardFilterDoc = z.infer<
  typeof PresetDashboardFilterDocSchema
>;

export interface IPresetDashboardFilter
  extends Omit<PresetDashboardFilter, 'source' | 'id'> {
  _id: Id;
  id: Id;
  team: Id;
  source: Id;
  createdAt: Date;
  updatedAt: Date;
}

export type PresetDashboardFilterInput = Omit<
  PresetDashboardFilter,
  'id' | 'source'
> & { source: Id };
