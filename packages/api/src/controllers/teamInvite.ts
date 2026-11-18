import { getMetadataStore } from '@/metadata';
import type { TeamInviteInput } from '@/metadata/schemas/teamInvite';

export type { ITeamInvite } from '@/metadata/schemas/teamInvite';

type IdLike = string | { toString(): string };

const invites = () => getMetadataStore().teamInvites;

/** The pending invite for the email (lowercased), created if absent. */
export function getOrCreateTeamInvite(teamId: IdLike, input: TeamInviteInput) {
  return invites().getOrCreate(teamId.toString(), input);
}

export function listTeamInvites(teamId: IdLike) {
  return invites().listByTeam(teamId.toString());
}

export function findTeamInviteByToken(token: string) {
  return invites().getByToken(token);
}

/** False when the invite is missing or belongs to another team. */
export function deleteTeamInvite(teamId: IdLike, id: string) {
  return invites().deleteForTeam(teamId.toString(), id);
}

export function consumeTeamInvite(id: string) {
  return invites().consume(id);
}
