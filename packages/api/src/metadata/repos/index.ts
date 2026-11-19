import { ConnectionRepository } from '@/metadata/repos/connections';
import type { RepoDeps } from '@/metadata/repos/docs';
import { SourceRepository } from '@/metadata/repos/sources';
import { TeamInviteRepository } from '@/metadata/repos/teamInvites';
import { TeamRepository } from '@/metadata/repos/teams';
import { UserRepository } from '@/metadata/repos/users';

/** The entity repositories switched so far (C1: identity, C2: connections and sources). */
export type Repositories = {
  teams: TeamRepository;
  users: UserRepository;
  teamInvites: TeamInviteRepository;
  connections: ConnectionRepository;
  sources: SourceRepository;
};

export function createRepositories(deps: RepoDeps): Repositories {
  return {
    teams: new TeamRepository(deps),
    users: new UserRepository(deps),
    teamInvites: new TeamInviteRepository(deps),
    connections: new ConnectionRepository(deps),
    sources: new SourceRepository(deps),
  };
}
