import type { OnboardingTaskId } from '@couchbase-traces/common-utils/dist/types';
import { isPersistableUserId as isPersistableUserIdHex } from '@couchbase-traces/common-utils/dist/types';

import { getMetadataStore } from '@/metadata';
import type { VirtualUserInput } from '@/metadata/schemas/user';
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
 * Registers a user: UserExistsError for a taken email, scrypt instead of pbkdf2 (D4).
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
 * team's org API keys. The count, the delete, and the hand-over of the
 * member's alerts commit as one transaction, so nothing needs putting back.
 */
export async function deleteTeamMember(
  teamId: IdLike,
  userIdToDelete: string,
  userIdRequestingDelete: IdLike,
): Promise<'deleted' | 'not_found' | 'last_member'> {
  return users().removeMember(
    teamId.toString(),
    userIdToDelete,
    userIdRequestingDelete.toString(),
  );
}
