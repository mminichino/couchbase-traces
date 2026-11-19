// App metadata keyspace (metadata plan, D1/D7/D8). Pure data and
// string builders only: no SDK import, so any entry point may use it. The
// ingest setup command and the API both read these definitions, so the
// provisioned layout and the startup verification cannot drift apart.
import { keyspace, quoteIdent } from './sqlpp';

/** Raise when a release makes a non-additive document change (plan §2.6). */
export const METADATA_SCHEMA_VERSION = 1;

export const METADATA_DEFAULTS = {
  bucket: 'cbt_meta',
  scope: 'app',
  user: 'cbt_meta',
  ramMb: 256,
} as const;

/** Key of the schema version marker in the `system` collection. */
export const METADATA_SCHEMA_KEY = 'meta::schema';

const THIRTY_DAYS_S = 30 * 24 * 60 * 60;

export const METADATA_COLLECTIONS = [
  { name: 'teams', maxTTL: 0 },
  { name: 'users', maxTTL: 0 },
  { name: 'team_invites', maxTTL: THIRTY_DAYS_S },
  { name: 'connections', maxTTL: 0 },
  { name: 'sources', maxTTL: 0 },
  { name: 'saved_searches', maxTTL: 0 },
  { name: 'dashboards', maxTTL: 0 },
  { name: 'alerts', maxTTL: 0 },
  { name: 'alert_history', maxTTL: THIRTY_DAYS_S },
  { name: 'webhooks', maxTTL: 0 },
  { name: 'favorites', maxTTL: 0 },
  { name: 'pinned_filters', maxTTL: 0 },
  { name: 'preset_dashboard_filters', maxTTL: 0 },
  { name: 'unique_keys', maxTTL: 0 },
  { name: 'sessions', maxTTL: 0 },
  { name: 'system', maxTTL: 0 },
  { name: 'txn_meta', maxTTL: 0 },
] as const;

export type MetaCollection = (typeof METADATA_COLLECTIONS)[number]['name'];

export const METADATA_COLLECTION_NAMES: readonly MetaCollection[] =
  METADATA_COLLECTIONS.map(c => c.name);

export type MetadataIndexSpec = {
  name: string;
  collection: MetaCollection;
  /** SQL++ index key expressions; identifiers already backtick-quoted. */
  keys: string[];
  where?: string;
};

const f = quoteIdent;
const tagsArray = `DISTINCT ARRAY t FOR t IN ${f('tags')} END`;

export const METADATA_INDEXES: readonly MetadataIndexSpec[] = [
  { name: 'ix_teams_created', collection: 'teams', keys: [f('createdAt')] },
  {
    name: 'ix_users_team',
    collection: 'users',
    keys: [f('team'), f('isVirtual'), f('createdAt')],
  },
  {
    name: 'ix_users_orgkeys',
    collection: 'users',
    keys: [f('team'), f('createdBy')],
    where: `${f('isVirtual')} = true`,
  },
  {
    name: 'ix_invites_team',
    collection: 'team_invites',
    keys: [f('teamId'), f('createdAt')],
  },
  {
    name: 'ix_connections_team',
    collection: 'connections',
    keys: [f('team')],
  },
  {
    name: 'ix_sources_team',
    collection: 'sources',
    keys: [f('team'), f('kind')],
  },
  {
    name: 'ix_sources_connection',
    collection: 'sources',
    keys: [f('team'), f('connection')],
  },
  {
    name: 'ix_saved_searches_team',
    collection: 'saved_searches',
    keys: [f('team')],
  },
  {
    name: 'ix_saved_searches_tags',
    collection: 'saved_searches',
    keys: [f('team'), tagsArray],
  },
  { name: 'ix_dashboards_team', collection: 'dashboards', keys: [f('team')] },
  {
    name: 'ix_dashboards_tags',
    collection: 'dashboards',
    keys: [f('team'), tagsArray],
  },
  {
    name: 'ix_dashboards_provisioned',
    collection: 'dashboards',
    keys: [f('team'), f('name')],
    where: `${f('provisioned')} = true`,
  },
  { name: 'ix_alerts_team', collection: 'alerts', keys: [f('team')] },
  {
    name: 'ix_alerts_page',
    collection: 'alerts',
    keys: [
      f('team'),
      `IFMISSINGORNULL(${f('displayName')}, NULL)`,
      'META().id',
    ],
  },
  {
    name: 'ix_alerts_tags',
    collection: 'alerts',
    keys: [f('team'), tagsArray],
  },
  {
    name: 'ix_alerts_saved_search',
    collection: 'alerts',
    keys: [f('team'), f('savedSearch')],
  },
  {
    name: 'ix_alerts_dashboard',
    collection: 'alerts',
    keys: [f('team'), f('dashboard'), f('tileId')],
  },
  {
    name: 'ix_alerts_created_by',
    collection: 'alerts',
    keys: [f('team'), f('createdBy')],
  },
  {
    name: 'ix_alert_history_alert',
    collection: 'alert_history',
    keys: [f('alert'), `${f('createdAt')} DESC`, f('state')],
  },
  {
    name: 'ix_alert_history_group',
    collection: 'alert_history',
    keys: [
      f('alert'),
      `IFMISSINGORNULL(${f('group')}, "")`,
      `${f('createdAt')} DESC`,
      f('state'),
    ],
  },
  {
    name: 'ix_webhooks_team',
    collection: 'webhooks',
    keys: [f('team'), f('service')],
  },
  {
    name: 'ix_favorites_user',
    collection: 'favorites',
    keys: [f('team'), f('user')],
  },
  {
    name: 'ix_favorites_resource',
    collection: 'favorites',
    keys: [f('team'), f('resourceType'), f('resourceId')],
  },
  {
    name: 'ix_pinned_filters_team',
    collection: 'pinned_filters',
    keys: [f('team')],
  },
  {
    name: 'ix_preset_filters',
    collection: 'preset_dashboard_filters',
    keys: [f('team'), f('presetDashboard'), f('source')],
  },
];

/**
 * Roles for the metadata service user (D12). Bucket-wide, and nothing on the
 * telemetry bucket: connection passwords live here.
 */
export function metadataRoles(bucket: string): string[] {
  return [
    ...[
      'data_reader',
      'data_writer',
      'query_select',
      'query_insert',
      'query_update',
      'query_delete',
    ].map(role => `${role}[${bucket}]`),
    // Startup verification reads system:indexes, a restricted catalog.
    'query_system_catalog',
  ];
}

/** Extra roles for API auto-provisioning (dev, CI, all-in-one only). */
export function metadataProvisionRoles(bucket: string): string[] {
  return [`scope_admin[${bucket}]`, `query_manage_index[${bucket}]`];
}

/**
 * DDL cannot take named parameters, so the replica count is validated and
 * inlined; every identifier goes through quoteIdent.
 */
export function metadataIndexStatement(
  bucket: string,
  scope: string,
  spec: MetadataIndexSpec,
  replicas: number,
): string {
  if (!Number.isInteger(replicas) || replicas < 0 || replicas > 3) {
    throw new Error('Index replicas must be an integer from 0 to 3');
  }
  const on = keyspace({ bucket, scope, collection: spec.collection });
  const where = spec.where ? ` WHERE ${spec.where}` : '';
  return (
    `CREATE INDEX ${quoteIdent(spec.name)} IF NOT EXISTS ON ${on}` +
    `(${spec.keys.join(', ')})${where}` +
    ` WITH {"defer_build": true, "num_replica": ${replicas}}`
  );
}

export function metadataBuildStatement(
  bucket: string,
  scope: string,
  collection: MetaCollection,
  names: string[],
): string {
  const on = keyspace({ bucket, scope, collection });
  return `BUILD INDEX ON ${on}(${names.map(n => quoteIdent(n)).join(', ')})`;
}

export type MetadataSchemaDoc = {
  schemaVersion: number;
  appVersion?: string;
  provisionedAt: string;
  updatedAt: string;
};

/** True when the stored marker is from a newer release than this code. */
export function isSchemaNewer(
  stored: number | null | undefined,
  code: number = METADATA_SCHEMA_VERSION,
): boolean {
  return stored != null && stored > code;
}
