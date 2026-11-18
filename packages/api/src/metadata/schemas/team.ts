import {
  type Team,
  TeamQuerySettingsSchema,
} from '@couchbase-traces/common-utils/dist/types';
import { z } from 'zod';

import type { Id } from '@/metadata/ids';
import { IsoDate } from '@/metadata/schemas/common';

/** `teams/<id>`: the Mongoose Team fields and defaults (plan §3.2). */
export const TeamDocSchema = z
  .object({
    name: z.string(),
    allowedAuthMethods: z.array(z.literal('password')).default([]),
    hookId: z.string(),
    apiKey: z.string(),
    collectorAuthenticationEnforced: z.boolean().default(false),
    isMetricsSeriesTableEnabled: z.boolean().default(false),
    createdAt: IsoDate,
    updatedAt: IsoDate,
  })
  .merge(TeamQuerySettingsSchema);

export type TeamDoc = z.infer<typeof TeamDocSchema>;

/** What repositories return: the wire shape Mongoose `toJSON` produced. */
export interface ITeam extends Omit<Team, 'id'> {
  _id: Id;
  id: Id;
  allowedAuthMethods: 'password'[];
  createdAt: Date;
  updatedAt: Date;
}

export type TeamInput = {
  name: string;
  collectorAuthenticationEnforced?: boolean;
};
