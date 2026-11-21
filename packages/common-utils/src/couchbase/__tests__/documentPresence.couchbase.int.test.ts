/**
 * D5: onboarding "has data" probe on a live 8.0 cluster. COUNT(*) with no
 * predicate must answer without a primary index (collection statistics), and
 * a source pointing at a missing collection is "no data", not an error.
 * Requires port/couchbase-test (CBT_TEST_COUCHBASE_*).
 */
import { hasDocuments } from '@/couchbase/documentPresence';
import { clusterCache, CouchbaseNodeClient } from '@/couchbase/node';

import {
  adminMutate,
  ks,
  liveConnection,
  probeLive,
  seed,
} from './liveCluster';

const conn = liveConnection('d5-presence');
const EMPTY = 'd5_empty_noindex';
const FILLED = 'd5_filled';

const source = (tableName: string) => ({
  databaseName: 'test',
  scopeName: 'app',
  tableName,
});

let live = false;

async function untilKeyspaceVisible(step: () => Promise<unknown>) {
  for (let i = 0; ; i++) {
    try {
      await step();
      return;
    } catch (err) {
      if (i >= 30 || !String(err).includes('12003')) throw err;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

beforeAll(async () => {
  live = await probeLive(conn, 'Onboarding data presence');
  if (!live) return;
  // No index DDL at all: COUNT(*) without a predicate is a CountScan, and
  // async index builds here would race the next suite's DDL.
  // CREATE COLLECTION returns before the query service sees the keyspace
  // (12003 for a few seconds), so retry until a read succeeds.
  for (const name of [EMPTY, FILLED]) {
    await untilKeyspaceVisible(async () => {
      await adminMutate(`CREATE COLLECTION ${ks(name)} IF NOT EXISTS`);
      await adminMutate(`SELECT RAW COUNT(*) FROM ${ks(name)}`);
    });
  }
  // seed() waits on COUNT(*), which also needs no index.
  await untilKeyspaceVisible(() => seed(FILLED, [{ Body: 'hello' }]));
}, 180000);

afterAll(async () => {
  await clusterCache.closeAll();
});

const client = () => new CouchbaseNodeClient({ conn, team: null });

describe('D5 onboarding data presence on a live cluster', () => {
  it('is false for an empty collection with no index', async () => {
    if (!live) return;
    await expect(
      hasDocuments(client(), {
        connectionId: 'd5-presence',
        keyspaces: [source(EMPTY)],
      }),
    ).resolves.toBe(false);
  });

  it('is true for a collection with documents and no index', async () => {
    if (!live) return;
    await expect(
      hasDocuments(client(), {
        connectionId: 'd5-presence',
        keyspaces: [source(EMPTY), source(FILLED)],
      }),
    ).resolves.toBe(true);
  });

  it('is false, not an error, for a missing collection', async () => {
    if (!live) return;
    await expect(
      hasDocuments(client(), {
        connectionId: 'd5-presence',
        keyspaces: [source('d5_does_not_exist')],
      }),
    ).resolves.toBe(false);
  });
});
