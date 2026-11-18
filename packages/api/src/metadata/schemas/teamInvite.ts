import { z } from 'zod';

import type { Id } from '@/metadata/ids';
import { IsoDate } from '@/metadata/schemas/common';

/** Invites expire 30 days after creation (the Mongo TTL index, now KV expiry). */
export const INVITE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** `team_invites/<id>`, with KV expiry createdAt + 30d. */
export const TeamInviteDocSchema = z.object({
  teamId: z.string(),
  name: z.string().optional(),
  email: z.string(),
  token: z.string(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});

export type TeamInviteDoc = z.infer<typeof TeamInviteDocSchema>;

export interface ITeamInvite {
  _id: Id;
  teamId: Id;
  name?: string;
  email: string;
  token: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TeamInviteInput = { email: string; name?: string };
