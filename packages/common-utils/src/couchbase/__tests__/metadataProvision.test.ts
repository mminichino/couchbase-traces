import {
  METADATA_COLLECTIONS,
  METADATA_INDEXES,
  METADATA_SCHEMA_KEY,
  METADATA_SCHEMA_VERSION,
} from '@/couchbase/metadataKeyspace';
import { verifyMetadataKeyspace } from '@/couchbase/nodeMetadataIndexes';
import {
  ensureMetadataKeyspace,
  type MetadataProvisionOptions,
} from '@/couchbase/nodeMetadataProvision';

class NotFound extends Error {
  name = 'DocumentNotFoundError';
}

/** Minimal in-memory stand-in for the SDK surface provisioning touches. */
function fakeCluster() {
  const state = {
    buckets: [] as string[],
    scopes: new Map<string, { name: string; maxExpiry: number }[]>(),
    indexes: new Map<string, { keyspace_id: string; state: string }>(),
    users: new Map<string, string[]>(),
    docs: new Map<string, unknown>(),
    statements: [] as string[],
    /** When set, BUILD INDEX fails with GSI 4360 but still brings indexes online. */
    queueBuilds: false,
  };
  const collections = () => ({
    getAllScopes: async () =>
      [...state.scopes].map(([name, collections]) => ({ name, collections })),
    createScope: async (name: string) => void state.scopes.set(name, []),
    createCollection: async (
      name: string,
      scope: string,
      o: { maxExpiry: number },
    ) => void state.scopes.get(scope)!.push({ name, maxExpiry: o.maxExpiry }),
    updateCollection: async () => undefined,
  });
  const cluster = {
    buckets: () => ({
      getAllBuckets: async () => state.buckets.map(name => ({ name })),
      createBucket: async (s: { name: string }) =>
        void state.buckets.push(s.name),
    }),
    bucket: () => ({
      collections,
      scope: () => ({
        collection: () => ({
          get: async (key: string) => {
            if (!state.docs.has(key)) throw new NotFound();
            return { content: state.docs.get(key) };
          },
          upsert: async (key: string, value: unknown) =>
            void state.docs.set(key, value),
        }),
      }),
    }),
    query: async (
      statement: string,
      o?: { parameters?: Record<string, string> },
    ) => {
      state.statements.push(statement);
      if (statement.includes('FROM system:scopes')) {
        const name = o?.parameters?.scope ?? '';
        return { rows: state.scopes.has(name) ? [name] : [] };
      }
      if (statement.includes('FROM system:keyspaces')) {
        const list = state.scopes.get(o?.parameters?.scope ?? '') ?? [];
        return { rows: list.map(c => c.name) };
      }
      const create = /^CREATE INDEX `([^`]+)` .*?`app`\.`([^`]+)`/.exec(
        statement,
      );
      if (create) {
        state.indexes.set(create[1], {
          keyspace_id: create[2],
          state: 'deferred',
        });
      }
      if (statement.startsWith('BUILD INDEX')) {
        for (const index of state.indexes.values()) index.state = 'online';
        if (state.queueBuilds) {
          throw new Error(
            'internal server failure: Some index will be retried building in the background',
          );
        }
      }
      return {
        rows: [...state.indexes].map(([name, v]) => ({ name, ...v })),
      };
    },
    users: () => ({
      getUser: async (name: string) => {
        if (!state.users.has(name)) {
          throw Object.assign(new Error('user not found'), {
            name: 'UserNotFoundError',
          });
        }
        return {};
      },
      upsertUser: async (u: { username: string; roles: string[] }) =>
        void state.users.set(u.username, u.roles),
    }),
  };
  return { cluster: cluster as never, state };
}

const options = (
  overrides: Partial<MetadataProvisionOptions> = {},
): MetadataProvisionOptions => ({
  bucket: 'cbt_meta',
  scope: 'app',
  ramMb: 256,
  replicas: 0,
  indexReplicas: 0,
  createBucket: true,
  user: { username: 'cbt_meta', password: 'pw', provisionRoles: false },
  waitTimeoutS: 1,
  log: () => undefined,
  now: () => new Date('2026-11-18T00:00:00.000Z'),
  ...overrides,
});

describe('ensureMetadataKeyspace', () => {
  it('creates everything once and nothing on the second run', async () => {
    const { cluster, state } = fakeCluster();
    const first = await ensureMetadataKeyspace(cluster, options());
    expect(first.created).toContain('bucket cbt_meta');
    expect(first.created).toContain('scope app');
    expect(first.created).toHaveLength(
      2 + METADATA_COLLECTIONS.length + METADATA_INDEXES.length,
    );
    expect(state.users.get('cbt_meta')).toContain('data_writer[cbt_meta]');
    expect(state.docs.get(METADATA_SCHEMA_KEY)).toMatchObject({
      schemaVersion: METADATA_SCHEMA_VERSION,
      provisionedAt: '2026-11-18T00:00:00.000Z',
    });

    const second = await ensureMetadataKeyspace(cluster, options());
    expect(second.created).toEqual([]);
    expect(
      await verifyMetadataKeyspace(cluster, {
        bucket: 'cbt_meta',
        scope: 'app',
      }),
    ).toEqual({ ok: true, missing: [], building: [] });
  });

  it('fails with exit code 2 when the bucket is missing and may not be created', async () => {
    const { cluster } = fakeCluster();
    await expect(
      ensureMetadataKeyspace(cluster, options({ createBucket: false })),
    ).rejects.toMatchObject({ name: 'MetadataProvisionError', exitCode: 2 });
  });

  it('refuses to touch a bucket written by a newer release', async () => {
    const { cluster, state } = fakeCluster();
    await ensureMetadataKeyspace(cluster, options());
    state.docs.set(METADATA_SCHEMA_KEY, {
      schemaVersion: METADATA_SCHEMA_VERSION + 1,
    });
    await expect(
      ensureMetadataKeyspace(cluster, options()),
    ).rejects.toMatchObject({ exitCode: 6 });
  });

  it('waits for builds the index service queued in the background', async () => {
    const { cluster, state } = fakeCluster();
    state.queueBuilds = true;
    const result = await ensureMetadataKeyspace(cluster, options());
    expect(result.created).toContain('bucket cbt_meta');
    expect(
      await verifyMetadataKeyspace(cluster, {
        bucket: 'cbt_meta',
        scope: 'app',
      }),
    ).toMatchObject({ ok: true });
  });

  it('grants DDL roles only when asked to', async () => {
    const { cluster, state } = fakeCluster();
    await ensureMetadataKeyspace(
      cluster,
      options({
        user: { username: 'api', password: 'pw', provisionRoles: true },
      }),
    );
    expect(state.users.get('api')).toContain('query_manage_index[cbt_meta]');
  });
});

describe('verifyMetadataKeyspace', () => {
  it('reports a missing scope', async () => {
    const { cluster } = fakeCluster();
    expect(
      await verifyMetadataKeyspace(cluster, {
        bucket: 'cbt_meta',
        scope: 'app',
      }),
    ).toEqual({ ok: false, missing: ['scope app'], building: [] });
  });
});
