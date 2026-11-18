import type { OnboardingTaskId } from '@couchbase-traces/common-utils/dist/types';
import { isPersistableUserId as isPersistableUserIdHex } from '@couchbase-traces/common-utils/dist/types';
import opentelemetry from '@opentelemetry/api';
import mongoose from 'mongoose';

import { getMetadataStore } from '@/metadata';
import type { RemovedUser } from '@/metadata/repos/users';
import type { VirtualUserInput } from '@/metadata/schemas/user';
import Alert from '@/models/alert';
import { getCounter } from '@/utils/instrumentation';
import logger from '@/utils/logger';

export { hashOrgApiKey, ORG_API_KEY_PREFIX } from '@/metadata/repos/users';
export type { IUser } from '@/metadata/schemas/user';

type IdLike = string | { toString(): string };

const users = () => getMetadataStore().users;

export function findUserByAccessKey(accessKey: string, now = new Date()) {
  return users().getByAccessKey(accessKey, now);
}

/**
 * Rotates a user's personal access key, immediately revoking the previous one.
 *
 * There is exactly one key per user and no grace period: findUserByAccessKey
 * above is hit uncached on every bearer request (see validateUserAccessKey), so
 * requests presenting the old key start 401ing the instant this returns.
 */
export function rotateUserAccessKey(userId: IdLike) {
  return users().rotateAccessKey(userId.toString());
}

export function findUserById(id: string) {
  return users().getById(id);
}

/**
 * passport-local-mongoose `register`: same error messages, UserExistsError
 * for a taken email, scrypt instead of pbkdf2 (D4).
 */
export function registerUser(
  input: { email: string; name?: string; team: string },
  password: string,
) {
  return users().register(input, password);
}

export function createVirtualUser(input: VirtualUserInput) {
  return users().createVirtual(input);
}

export function findUserByEmail(email: string) {
  return users().getByEmail(email);
}

export function findUsersByTeam(team: IdLike) {
  return users().listByTeam(team.toString());
}

// Type-guard wrapper over the shared 24-hex check; rejects the synthetic
// `_local_user_` id injected in IS_LOCAL_APP_MODE (see isPersistableUserIdHex).
function isPersistableUserId(
  userId: IdLike | undefined | null,
): userId is IdLike {
  return userId != null && isPersistableUserIdHex(String(userId));
}

// Returns null for a non-persistable user so the route reports unchanged
// default state rather than a write that silently matched nothing.
export async function completeOnboardingTask(
  userId: IdLike,
  taskId: OnboardingTaskId,
) {
  if (!isPersistableUserId(userId)) {
    return null;
  }
  return users().addOnboardingTask(userId.toString(), taskId);
}

export async function setOnboardingDismissed(
  userId: IdLike,
  isDismissed: boolean,
) {
  if (!isPersistableUserId(userId)) {
    return null;
  }
  return users().setOnboardingDismissed(userId.toString(), isDismissed);
}

// Fire-and-forget recording from an unrelated write path (alert/dashboard save,
// MCP tool call): must never fail or delay the triggering operation, so errors
// are swallowed. The repository skips the write once already recorded — these
// fire on every save / tool call, so it avoids write amplification on hot paths.
export function recordOnboardingTaskCompletion(
  userId: IdLike | undefined | null,
  taskId: OnboardingTaskId,
) {
  if (!isPersistableUserId(userId)) {
    return;
  }
  void Promise.resolve()
    .then(() => users().recordOnboardingTask(userId.toString(), taskId))
    .catch(err => {
      logger.warn(
        { error: err, userId: userId.toString(), taskId },
        'Failed to record onboarding task completion',
      );
    });
}

/**
 * Never removes the last person, so someone can always sign in to revoke the
 * team's org API keys. Users and alerts live in different stores until C4, so
 * delete first and put the member back if a concurrent removal emptied the
 * team.
 */
export async function deleteTeamMember(
  teamId: IdLike,
  userIdToDelete: string,
  userIdRequestingDelete: IdLike,
): Promise<'deleted' | 'not_found' | 'last_member'> {
  const team = teamId.toString();
  const target = await users().getById(userIdToDelete);
  if (target == null || target.team !== team || target.isVirtual) {
    return 'not_found';
  }
  // Checked first so the usual case never deletes; the restore below only
  // covers two removals racing past this check.
  if ((await users().countPeople(team)) <= 1) {
    return 'last_member';
  }
  const removed = await users().removeMember(team, userIdToDelete);
  if (removed == null) {
    return 'not_found';
  }
  let isTeamEmpty = true;
  try {
    isTeamEmpty = (await users().countPeople(team)) === 0;
  } finally {
    // Also runs if the count throws, so a failed check can't lose the member.
    if (isTeamEmpty) {
      await restoreTeamMember(removed);
    }
  }
  if (isTeamEmpty) {
    return 'last_member';
  }
  await Alert.updateMany(
    { createdBy: removed.id, team },
    {
      $set: {
        createdBy: new mongoose.Types.ObjectId(
          userIdRequestingDelete.toString(),
        ),
      },
    },
  );
  return 'deleted';
}

const memberRestoreFailures = getCounter('cbt.team.member_restore_failures', {
  description:
    'Removed team members that could not be put back after the team emptied.',
});

const RESTORE_ATTEMPTS = 3;
const RESTORE_RETRY_DELAY_MS = 100;

async function restoreTeamMember(user: RemovedUser) {
  for (let attempt = 1; ; attempt++) {
    try {
      await users().restore(user);
      return;
    } catch (err) {
      // A taken email (UserExistsError) can't succeed on retry.
      const retryable =
        !(err instanceof Error && err.name === 'UserExistsError') &&
        attempt < RESTORE_ATTEMPTS;
      if (retryable) {
        await new Promise(r => setTimeout(r, RESTORE_RETRY_DELAY_MS * attempt));
        continue;
      }
      memberRestoreFailures.add(1);
      opentelemetry.trace
        .getActiveSpan()
        ?.recordException(err instanceof Error ? err : new Error(String(err)));
      logger.error(
        { error: err, userId: user.id, teamId: user.doc.team },
        'Failed to restore a removed team member',
      );
      throw err;
    }
  }
}
