import { ConnectionRepository } from '@/metadata/repos/connections';
import { DashboardRepository } from '@/metadata/repos/dashboards';
import type { RepoDeps } from '@/metadata/repos/docs';
import { FavoriteRepository } from '@/metadata/repos/favorites';
import { PinnedFilterRepository } from '@/metadata/repos/pinnedFilters';
import { PresetDashboardFilterRepository } from '@/metadata/repos/presetDashboardFilters';
import { SavedSearchRepository } from '@/metadata/repos/savedSearches';
import { SourceRepository } from '@/metadata/repos/sources';
import { TagRepository } from '@/metadata/repos/tags';
import { TeamInviteRepository } from '@/metadata/repos/teamInvites';
import { TeamRepository } from '@/metadata/repos/teams';
import { UserRepository } from '@/metadata/repos/users';
import { WebhookRepository } from '@/metadata/repos/webhooks';

/**
 * The entity repositories switched so far (C1: identity, C2: connections and
 * sources, C3: saved searches, dashboards, favorites, pinned and preset
 * filters, webhooks, tags).
 */
export type Repositories = {
  teams: TeamRepository;
  users: UserRepository;
  teamInvites: TeamInviteRepository;
  connections: ConnectionRepository;
  sources: SourceRepository;
  savedSearches: SavedSearchRepository;
  dashboards: DashboardRepository;
  favorites: FavoriteRepository;
  pinnedFilters: PinnedFilterRepository;
  presetDashboardFilters: PresetDashboardFilterRepository;
  webhooks: WebhookRepository;
  tags: TagRepository;
};

export function createRepositories(deps: RepoDeps): Repositories {
  return {
    teams: new TeamRepository(deps),
    users: new UserRepository(deps),
    teamInvites: new TeamInviteRepository(deps),
    connections: new ConnectionRepository(deps),
    sources: new SourceRepository(deps),
    savedSearches: new SavedSearchRepository(deps),
    dashboards: new DashboardRepository(deps),
    favorites: new FavoriteRepository(deps),
    pinnedFilters: new PinnedFilterRepository(deps),
    presetDashboardFilters: new PresetDashboardFilterRepository(deps),
    webhooks: new WebhookRepository(deps),
    tags: new TagRepository(deps),
  };
}
