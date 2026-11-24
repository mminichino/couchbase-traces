import type { CouchbaseConnectionConfig } from '@couchbase-traces/common-utils/dist/couchbase/node';
import type { ConnectionSchema } from '@couchbase-traces/common-utils/dist/types';
import type { z } from 'zod';

import { getMetadataStore } from '@/metadata';
import type {
  ConnectionInput,
  ConnectionPatch,
  IConnection,
} from '@/metadata/schemas/connection';
import { idSchema } from '@/utils/zod';

export type ConnectionValidation =
  | { ok: true }
  | { ok: false; status: 400 | 403; message: string };

export async function validateConnectionId(
  connection: unknown,
  teamId: string | { toString(): string } | undefined,
): Promise<ConnectionValidation> {
  const parsed = idSchema.safeParse(connection);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      message: 'connection must be a valid connection id',
    };
  }
  if (teamId == null) {
    return { ok: false, status: 403, message: 'Forbidden' };
  }
  const connectionExists = await getMetadataStore().connections.exists(
    teamId.toString(),
    parsed.data.toString(),
  );
  if (!connectionExists) {
    return {
      ok: false,
      status: 400,
      message: 'connection must be an existing connection id',
    };
  }
  return { ok: true };
}

// Returns all connections across all teams. Only intended for instance-level
// operations (e.g. startup auto-provisioning); user-facing routes must use
// the team-scoped variants below.
export async function getConnections() {
  const store = getMetadataStore();
  const teams = await store.teams.listAll();
  // Never returns the password back to the user.
  return (
    await Promise.all(teams.map(team => store.connections.list(team._id)))
  ).flat();
}

export function getConnectionsByTeam(team: string) {
  return getMetadataStore().connections.list(team);
}

export function getConnectionById(
  team: string,
  connectionId: string,
  selectPassword = false,
) {
  return getMetadataStore().connections.get(team, connectionId, {
    secrets: selectPassword,
  });
}

/** Builds the config the Couchbase cluster cache keys on; `updatedAt` versions it. */
export function toCouchbaseConnectionConfig(
  connection: Pick<
    IConnection,
    | 'id'
    | 'host'
    | 'username'
    | 'password'
    | 'wanProfile'
    | 'tlsCaCertificate'
    | 'updatedAt'
  >,
): CouchbaseConnectionConfig {
  return {
    id: connection.id,
    host: connection.host,
    username: connection.username ?? '',
    password: connection.password || undefined,
    wanProfile: connection.wanProfile ?? undefined,
    tlsCaCertificate: connection.tlsCaCertificate || undefined,
    updatedAt: connection.updatedAt
      ? new Date(connection.updatedAt).toISOString()
      : '',
  };
}

export function createConnection(team: string, connection: ConnectionInput) {
  return getMetadataStore().connections.create(team, connection);
}

export function updateConnection(
  team: string,
  connectionId: string,
  connection: ConnectionPatch,
  unsetFields: string[] = [],
) {
  return getMetadataStore().connections.update(
    team,
    connectionId,
    connection,
    unsetFields,
  );
}

/**
 * Shared by the internal and external PUT handlers. An empty password keeps
 * the stored one; optional secrets are only written when set; a null
 * `managementPort` clears the stored port; `hyperdxSettingPrefix` is cleared
 * by null or '' and kept when omitted (upstream PUT). A stored legacy
 * `isPrometheusEndpoint` flag is turned off, as upstream's PUT with `false`:
 * PromQL is dropped and `rejectPromqlBody` rejects writes that set it.
 */
export function buildCouchbaseConnectionUpdate(
  body: Omit<
    z.infer<typeof ConnectionSchema>,
    'id' | 'hyperdxSettingPrefix'
  > & {
    hyperdxSettingPrefix?: string | null;
  },
  stored: { password?: string; isPrometheusEndpoint?: boolean },
) {
  const {
    tlsCaCertificate,
    monitorPassword,
    managementPort,
    hyperdxSettingPrefix,
    ...rest
  } = body;
  const update = {
    ...rest,
    kind: 'couchbase' as const,
    password: body.password || stored.password,
    ...(tlsCaCertificate ? { tlsCaCertificate } : {}),
    ...(monitorPassword ? { monitorPassword } : {}),
    ...(typeof managementPort === 'number' ? { managementPort } : {}),
    ...(hyperdxSettingPrefix ? { hyperdxSettingPrefix } : {}),
    ...(stored.isPrometheusEndpoint != null
      ? { isPrometheusEndpoint: false }
      : {}),
  };
  const unsetFields = [
    ...(managementPort === null ? ['managementPort'] : []),
    ...(hyperdxSettingPrefix === null || hyperdxSettingPrefix === ''
      ? ['hyperdxSettingPrefix']
      : []),
  ];
  return { update, unsetFields };
}

export function deleteConnection(team: string, connectionId: string) {
  return getMetadataStore().connections.delete(team, connectionId);
}
