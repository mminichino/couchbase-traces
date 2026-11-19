import {
  TagResourceType,
  TagResourceTypeSchema,
  TeamQuerySettingsUpdate,
} from '@couchbase-traces/common-utils/dist/types';
import pick from 'lodash/pick';
import { v4 as uuidv4 } from 'uuid';

import * as config from '@/config';
import { getMetadataStore } from '@/metadata';
import type { CouchbaseTagKind } from '@/metadata/repos/tags';
import type { ITeam } from '@/metadata/schemas/team';

export type { ITeam } from '@/metadata/schemas/team';

type IdLike = string | { toString(): string };

const teams = () => getMetadataStore().teams;

export function getTeamInviteUrl(token: string) {
  return `${config.FRONTEND_URL}/join-team?token=${token}`;
}

const LOCAL_APP_TEAM_ID = '_local_team_';
// The hex of the 12 bytes Mongoose made an ObjectId from before C1.
const LOCAL_APP_TEAM_HEX = Buffer.from(LOCAL_APP_TEAM_ID).toString('hex');
export const LOCAL_APP_TEAM: ITeam = {
  _id: LOCAL_APP_TEAM_HEX,
  id: LOCAL_APP_TEAM_ID,
  name: 'Local App Team',
  allowedAuthMethods: [],
  // Placeholder keys
  hookId: uuidv4(),
  apiKey: uuidv4(),
  collectorAuthenticationEnforced: false,
  isMetricsSeriesTableEnabled: false,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

export async function isTeamExisting() {
  if (config.IS_LOCAL_APP_MODE) {
    return true;
  }
  return teams().exists();
}

/** Throws DuplicateKeyError('team_singleton') when a team already exists. */
export async function createTeam({
  name,
  collectorAuthenticationEnforced = true,
}: {
  name: string;
  collectorAuthenticationEnforced?: boolean;
}) {
  return teams().createFirst({ name, collectorAuthenticationEnforced });
}

/** Undoes createTeam when the first user can't be registered. */
export function removeTeam(teamId: IdLike) {
  return teams().remove(teamId.toString());
}

export async function getAllTeams(): Promise<ITeam[]> {
  if (config.IS_LOCAL_APP_MODE) {
    return [LOCAL_APP_TEAM];
  }
  return teams().listAll();
}

/**
 * The deployment's team. The id is not consulted (single team, as upstream's
 * `findOne({})`); `fields` narrows the result like a Mongoose projection,
 * which always kept `_id` and the `id` virtual.
 */
export async function getTeam<const F extends readonly (keyof ITeam)[]>(
  id: IdLike,
  fields: F,
): Promise<Pick<ITeam, F[number] | '_id' | 'id'> | null>;
export async function getTeam(id: IdLike): Promise<ITeam | null>;
export async function getTeam(_id: IdLike, fields?: readonly (keyof ITeam)[]) {
  const team = config.IS_LOCAL_APP_MODE
    ? LOCAL_APP_TEAM
    : await teams().getOnly();
  if (team == null || fields == null) return team;
  return pick(team, ['_id', 'id', ...fields]);
}

export async function getTeamByApiKey(apiKey: string) {
  if (config.IS_LOCAL_APP_MODE) {
    return LOCAL_APP_TEAM;
  }
  return teams().getByApiKey(apiKey);
}

export function rotateTeamApiKey(teamId: IdLike) {
  return teams().rotateApiKey(teamId.toString());
}

export function setTeamName(teamId: IdLike, name: string) {
  return teams().setName(teamId.toString(), name);
}

/** null removes a setting, undefined leaves it unchanged. */
export function updateTeamQuerySettings(
  teamId: IdLike,
  settings: TeamQuerySettingsUpdate,
) {
  return teams().updateQuerySettings(teamId.toString(), settings);
}

/**
 * Distinct tags applied to the team's entities. Scoped to one kind of entity
 * when `resourceType` is given.
 */
export async function getTags(teamId: IdLike, resourceType?: TagResourceType) {
  if (
    resourceType != null &&
    !TagResourceTypeSchema.safeParse(resourceType).success
  ) {
    throw new Error(`${resourceType} is not a valid TagResourceType`);
  }

  const kinds: CouchbaseTagKind[] =
    resourceType == null ? ['dashboard', 'savedSearch', 'alert'] : [resourceType];
  return getMetadataStore().tags.distinct(teamId.toString(), kinds);
}
