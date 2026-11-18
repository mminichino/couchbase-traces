import {
  isSchemaNewer,
  METADATA_COLLECTIONS,
  METADATA_INDEXES,
  METADATA_SCHEMA_VERSION,
  metadataBuildStatement,
  metadataIndexStatement,
  metadataProvisionRoles,
  metadataRoles,
} from '@/couchbase/metadataKeyspace';

describe('metaKeyspace definitions', () => {
  it('names every index after a declared collection, uniquely', () => {
    const collections = new Set(METADATA_COLLECTIONS.map(c => c.name));
    const names = METADATA_INDEXES.map(i => i.name);
    expect(new Set(names).size).toBe(names.length);
    for (const index of METADATA_INDEXES) {
      expect(collections.has(index.collection)).toBe(true);
    }
  });

  it('expires invites and alert history after 30 days only', () => {
    const ttl = Object.fromEntries(
      METADATA_COLLECTIONS.map(c => [c.name, c.maxTTL]),
    );
    expect(ttl.team_invites).toBe(2592000);
    expect(ttl.alert_history).toBe(2592000);
    expect(ttl.sessions).toBe(0);
    expect(ttl.users).toBe(0);
  });

  it('builds quoted, deferred index DDL', () => {
    const spec = METADATA_INDEXES.find(i => i.name === 'ix_users_orgkeys')!;
    expect(metadataIndexStatement('cbt_meta', 'app', spec, 1)).toBe(
      'CREATE INDEX `ix_users_orgkeys` IF NOT EXISTS ON `cbt_meta`.`app`.`users`' +
        '(`team`, `createdBy`) WHERE `isVirtual` = true' +
        ' WITH {"defer_build": true, "num_replica": 1}',
    );
  });

  it('quotes the reserved word group', () => {
    const spec = METADATA_INDEXES.find(
      i => i.name === 'ix_alert_history_group',
    )!;
    expect(metadataIndexStatement('b', 's', spec, 0)).toContain(
      'IFMISSINGORNULL(`group`, "")',
    );
  });

  it('rejects unsafe replica counts and identifiers', () => {
    const spec = METADATA_INDEXES[0];
    expect(() => metadataIndexStatement('b', 's', spec, 1.5)).toThrow();
    expect(() => metadataIndexStatement('b', 's', spec, -1)).toThrow();
    expect(() => metadataIndexStatement('b`x', 's', spec, 0)).toThrow(
      /backtick/,
    );
  });

  it('builds BUILD INDEX statements', () => {
    expect(metadataBuildStatement('b', 's', 'alerts', ['a', 'b'])).toBe(
      'BUILD INDEX ON `b`.`s`.`alerts`(`a`, `b`)',
    );
  });

  it('scopes the service roles to the metadata bucket', () => {
    expect(metadataRoles('cbt_meta')).toEqual([
      'data_reader[cbt_meta]',
      'data_writer[cbt_meta]',
      'query_select[cbt_meta]',
      'query_insert[cbt_meta]',
      'query_update[cbt_meta]',
      'query_delete[cbt_meta]',
      'query_system_catalog',
    ]);
    expect(metadataProvisionRoles('cbt_meta')).toEqual([
      'scope_admin[cbt_meta]',
      'query_manage_index[cbt_meta]',
    ]);
  });

  it('detects a stored schema from a newer release', () => {
    expect(isSchemaNewer(null)).toBe(false);
    expect(isSchemaNewer(METADATA_SCHEMA_VERSION)).toBe(false);
    expect(isSchemaNewer(METADATA_SCHEMA_VERSION + 1)).toBe(true);
  });
});
