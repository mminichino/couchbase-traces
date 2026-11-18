import type { RepoDeps } from '@/metadata/repos/docs';
import { TeamInviteRepository } from '@/metadata/repos/teamInvites';
import { TeamRepository } from '@/metadata/repos/teams';
import { UserRepository } from '@/metadata/repos/users';

/** The entity repositories switched so far (C1: identity). */
export type Repositories = {
  teams: TeamRepository;
  users: UserRepository;
  teamInvites: TeamInviteRepository;
};

export function createRepositories(deps: RepoDeps): Repositories {
  return {
    teams: new TeamRepository(deps),
    users: new UserRepository(deps),
    teamInvites: new TeamInviteRepository(deps),
  };
}
