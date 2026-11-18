import passport from 'passport';

import { findUserById } from '@/controllers/user';
import { getMetadataStore } from '@/metadata';
import { createLocalStrategy } from '@/metadata/auth/localStrategy';

import logger from './logger';

passport.serializeUser(function (user, done) {
  done(null, user._id);
});

passport.deserializeUser(function (id: string, done) {
  // Deferred so an unavailable store reaches `done` instead of throwing.
  Promise.resolve()
    .then(() => findUserById(id))
    .then(user => {
      // A session can never belong to a service account.
      if (user == null || user.isVirtual) {
        // The session outlived the user, e.g. the account was deleted. That is
        // not a server fault, and reporting it as one turned every request
        // still carrying the cookie into a 500, public routes included, so the
        // browser could not even reach the login page. `false` is passport's
        // "no such user" signal: the request continues unauthenticated.
        return done(null, false);
      }
      done(null, user);
    })
    .catch(done);
});

passport.use(createLocalStrategy(() => getMetadataStore().users, logger));

export default passport;
