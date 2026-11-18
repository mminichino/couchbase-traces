import {
  ONBOARDING_TASK_IDS,
  type OnboardingData,
} from '@couchbase-traces/common-utils/dist/types';
import { z } from 'zod';

import type { Id } from '@/metadata/ids';
import { IsoDate } from '@/metadata/schemas/common';

const OnboardingDocSchema = z.object({
  completedTasks: z.array(z.enum(ONBOARDING_TASK_IDS)).default([]),
  isDismissed: z.boolean().default(false),
});

/**
 * `users/<id>`. Org API keys are virtual users whose accessKey is the key's
 * SHA-256 and whose createdBy is set. `hash` is the scrypt string (D4) and
 * never leaves the repository except through getByEmailWithSecret.
 */
export const UserDocSchema = z.object({
  email: z.string(),
  name: z.string().optional(),
  team: z.string(),
  accessKey: z.string(),
  isVirtual: z.boolean().default(false),
  expiresAt: IsoDate.nullish(),
  lastUsedAt: IsoDate.nullish(),
  revokedAt: IsoDate.nullish(),
  createdBy: z.string().optional(),
  onboardingData: OnboardingDocSchema.default({}),
  hash: z.string().optional(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});

export type UserDoc = z.infer<typeof UserDocSchema>;

export interface IUser {
  _id: Id;
  accessKey: string;
  createdAt: Date;
  updatedAt: Date;
  email: string;
  // Optional, as on the Mongoose model: seeded and invited users may have none.
  name?: string;
  onboardingData: OnboardingData;
  // A service account: no sign-in, not listed as a team member.
  isVirtual: boolean;
  // Set only on virtual users backing an org API key; createdBy is what
  // marks a virtual user as one.
  expiresAt?: Date | null;
  lastUsedAt?: Date | null;
  revokedAt?: Date | null;
  createdBy?: Id;
  team: Id;
  hasPasswordAuth: boolean;
}

export type UserWithSecret = IUser & { hash?: string };

/** The fields `populate('createdBy', 'email name')` used to embed. */
export type UserDisplay = { _id: Id; email: string; name?: string };

export type VirtualUserInput = {
  teamId: Id;
  name: string;
  email: string;
  accessKey?: string;
  expiresAt?: Date | null;
  createdBy?: Id;
};
