import type { QueryOptions } from 'couchbase';

import { loadMetadataConfig } from '@/metadata/couchbase/config';
import { CouchbaseFind } from '@/metadata/couchbase/find';

const cfg = { bucket: 'cbt_meta', scope: 'app', password: 'hunter2' };

const fakeCluster = (rows: unknown[]) => {
  const query = jest.fn(async (_statement: string, _o: QueryOptions) => ({
    rows,
  }));
  return { cluster: { query }, query };
};

describe('metadata query timeout', () => {
  it('bounds find with the configured default', async () => {
    const { cluster, query } = fakeCluster([]);
    await new CouchbaseFind(cluster, { ...cfg, queryTimeoutMs: 7_000 }).find(
      'sources',
      { where: { team: 't' } },
    );
    expect(query.mock.calls[0][1]?.timeout).toBe(7_000);
  });

  it('bounds count with the configured default', async () => {
    const { cluster, query } = fakeCluster([3]);
    const n = await new CouchbaseFind(cluster, {
      ...cfg,
      queryTimeoutMs: 7_000,
    }).count('sources', { where: { team: 't' } });
    expect(n).toBe(3);
    expect(query.mock.calls[0][1]?.timeout).toBe(7_000);
  });

  it('lets one read override the default', async () => {
    const { cluster, query } = fakeCluster([]);
    await new CouchbaseFind(cluster, { ...cfg, queryTimeoutMs: 7_000 }).find(
      'sources',
      { where: { team: 't' }, timeoutMs: 250 },
    );
    expect(query.mock.calls[0][1]?.timeout).toBe(250);
  });

  it('surfaces a server timeout as unavailable, without secrets', async () => {
    const cluster = {
      query: jest.fn(async () => {
        throw Object.assign(new Error('timed out using hunter2'), {
          name: 'UnambiguousTimeoutError',
        });
      }),
    };
    const err = await new CouchbaseFind(cluster, {
      ...cfg,
      queryTimeoutMs: 1,
    })
      .find('sources', { where: { team: 't' } })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err instanceof Error && err.name).toBe('MetadataUnavailableError');
    expect(err instanceof Error && err.message).not.toContain('hunter2');
  });

  describe('CBT_METADATA_QUERY_TIMEOUT_MS', () => {
    const env = {
      CBT_METADATA_CONNSTR: 'couchbase://localhost',
      CBT_METADATA_USER: 'u',
      CBT_METADATA_PASSWORD: 'p',
    };

    it('defaults to 10 seconds', () => {
      expect(loadMetadataConfig(env).queryTimeoutMs).toBe(10_000);
    });

    it('can be overridden', () => {
      expect(
        loadMetadataConfig({ ...env, CBT_METADATA_QUERY_TIMEOUT_MS: '2500' })
          .queryTimeoutMs,
      ).toBe(2_500);
    });

    it('rejects zero and non-numeric values', () => {
      for (const bad of ['0', '-5', 'fast']) {
        expect(() =>
          loadMetadataConfig({ ...env, CBT_METADATA_QUERY_TIMEOUT_MS: bad }),
        ).toThrow('CBT_METADATA_QUERY_TIMEOUT_MS');
      }
    });
  });
});
