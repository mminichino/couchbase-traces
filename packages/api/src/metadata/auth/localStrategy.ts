import { Strategy as LocalStrategy } from 'passport-local';

import {
  AUTH_ERRORS,
  hashPassword,
  needsRehash,
  verifyPassword,
} from '@/metadata/auth/password';
import type { UserRepository } from '@/metadata/repos/users';
import type { IUser } from '@/metadata/schemas/user';

type AuthLogger = {
  info: (obj: object) => void;
  error: (obj: object, msg: string) => void;
};

// Spent on unknown emails so a miss costs about as much as a wrong password.
let dummyHash: Promise<string> | undefined;

/**
 * Email + password login over UserRepository with the messages
 * passport-local-mongoose gave (plan D4). Virtual users never sign in.
 */
export async function authenticate(
  users: UserRepository,
  email: string,
  password: string,
): Promise<{ user: IUser | false; message?: string; virtual?: boolean }> {
  if (!email) return { user: false, message: AUTH_ERRORS.missingUsername };
  if (!password) return { user: false, message: AUTH_ERRORS.missingPassword };
  const found = await users.getByEmailWithSecret(email);
  if (!found) {
    dummyHash ??= hashPassword('not-a-real-password');
    await verifyPassword(password, await dummyHash);
    return { user: false, message: AUTH_ERRORS.incorrect };
  }
  if (found.isVirtual) return { user: false, virtual: true };
  const { hash, ...user } = found;
  if (!(await verifyPassword(password, hash))) {
    return { user: false, message: AUTH_ERRORS.incorrect };
  }
  if (hash && needsRehash(hash)) {
    // Best effort: a failed upgrade must not fail the login.
    await hashPassword(password)
      .then(next => users.replacePasswordHash(user._id, hash, next))
      .catch(() => undefined);
  }
  return { user };
}

export function createLocalStrategy(
  users: () => UserRepository,
  logger: AuthLogger,
): LocalStrategy {
  return new LocalStrategy(
    { usernameField: 'email' },
    (username, password, done) => {
      authenticate(users(), username, password).then(
        ({ user, message, virtual }) => {
          if (virtual) {
            logger.info({
              message: `Login for "${username}" rejected, service account`,
              type: 'user_login',
              authType: 'password',
            });
            return done(null, false);
          }
          if (message) {
            logger.info({
              message: `Login for "${username}" failed, ${message}"`,
              type: 'user_login',
              authType: 'password',
            });
            return done(null, false, { message });
          }
          return done(null, user);
        },
        err => {
          logger.error({ err, username }, 'Login failed with error');
          done(err);
        },
      );
    },
  );
}
