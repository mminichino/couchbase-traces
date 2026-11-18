import { sqlpp } from '@couchbase-traces/common-utils/dist/couchbase/sqlpp';
import type { QueryOptions } from 'couchbase';
import { QueryScanConsistency } from 'couchbase';
import { z } from 'zod';

import { runQuery } from '@/metadata/couchbase/query';
import { MetadataError, MetadataUnavailableError } from '@/metadata/errors';
import { isValidId } from '@/metadata/ids';
import { createMemoryStore } from '@/metadata/testing/memoryStore';
import { seedDocs } from '@/metadata/testing/seed';

/** runQuery only needs Cluster#query. */
const fakeCluster = (rows: () => Promise<unknown[]>) => {
  const query = jest.fn(async (_statement: string, _o: QueryOptions) => ({
    rows: await rows(),
  }));
  return { cluster: { query }, query };
};

const statement = sqlpp`SELECT d.name FROM ${{ Keyspace: { bucket: 'cbt_meta', scope: 'app', collection: 'teams' } }} AS d WHERE d.team = ${{ Param: 't1' }}`;

describe('runQuery', () => {
  it('passes named parameters and reads its own writes by default', async () => {
    const { cluster, query } = fakeCluster(async () => [{ name: 'a' }]);
    const rows = await runQuery(cluster, statement);
    expect(rows).toEqual([{ name: 'a' }]);
    const [text, opts] = query.mock.calls[0];
    expect(text).toBe(statement.statement);
    expect(text).not.toContain("'t1'");
    expect(opts?.parameters).toEqual(statement.parameters);
    expect(opts?.scanConsistency).toBe(QueryScanConsistency.RequestPlus);
  });

  it('can opt out of request_plus', async () => {
    const { cluster, query } = fakeCluster(async () => []);
    await runQuery(cluster, statement, undefined, {
      consistency: 'not_bounded',
    });
    const opts = query.mock.calls[0][1];
    expect(opts?.scanConsistency).toBe(QueryScanConsistency.NotBounded);
  });

  it('validates rows against the schema', async () => {
    const { cluster } = fakeCluster(async () => [{ name: 'a' }, { name: 3 }]);
    await expect(
      runQuery(cluster, statement, z.object({ name: z.string() })),
    ).rejects.toThrow(
      new MetadataError(
        'Row 1 failed validation: Expected string, received number',
      ),
    );
  });

  it('maps SDK errors and scrubs secrets', async () => {
    const { cluster } = fakeCluster(async () => {
      throw Object.assign(new Error('timed out using hunter2'), {
        name: 'UnambiguousTimeoutError',
      });
    });
    const err = await runQuery(cluster, statement, undefined, {
      secrets: ['hunter2'],
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MetadataUnavailableError);
    expect(err instanceof Error && err.message).not.toContain('hunter2');
  });
});

describe('seedDocs', () => {
  it('inserts each document under a fresh id', async () => {
    const store = createMemoryStore();
    const keys = await seedDocs(store.kv, 'teams', [{ n: 1 }, { n: 2 }]);
    expect(keys).toHaveLength(2);
    expect(keys.every(isValidId)).toBe(true);
    expect((await store.kv.get('teams', keys[1]))?.value).toEqual({ n: 2 });
  });
});
