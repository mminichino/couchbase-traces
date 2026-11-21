/**
 * D4: schema inference on a live cluster. INFER on an empty collection fails
 * with 7014 "No documents found, unable to infer schema"; metadata must return
 * an empty schema instead, and pick up columns once documents arrive.
 * Requires port/couchbase-test (CBT_TEST_COUCHBASE_*).
 */
import { MetadataCache } from '@/core/metadata';
import { isEmptyInferError } from '@/couchbase/errors';
import { EMPTY_COLUMNS_CACHE_TTL_MS, Metadata } from '@/couchbase/metadata';
import { inferStatement } from '@/couchbase/metadataSql';
import { clusterCache, CouchbaseNodeClient } from '@/couchbase/node';

import {
  ensureCollection,
  liveConnection,
  probeLive,
  runSql,
  seed,
} from './liveCluster';

const conn = liveConnection('d4-empty-infer');
const EMPTY = 'd4_empty';
const FILLED = 'd4_filled';
const FILLING = 'd4_filling';

const tc = (tableName: string) => ({
  connectionId: 'd4-empty-infer',
  databaseName: 'test',
  scopeName: 'app',
  tableName,
});

const newMetadata = () =>
  new Metadata(
    new CouchbaseNodeClient({ conn, team: null }),
    new MetadataCache(),
  );

let live = false;

beforeAll(async () => {
  live = await probeLive(conn, 'Empty-collection INFER');
  if (!live) return;
  await ensureCollection(EMPTY);
  await ensureCollection(FILLED);
  await ensureCollection(FILLING);
  await seed(FILLED, [
    {
      ServiceName: 'api',
      Duration: 5,
      LogAttributes: { 'http.method': 'GET' },
    },
    {
      ServiceName: 'web',
      Duration: 7,
      LogAttributes: { 'http.method': 'PUT' },
    },
  ]);
}, 120000);

afterAll(async () => {
  await clusterCache.closeAll();
});

describe('D4 schema inference on a live cluster', () => {
  it('INFER on an empty collection raises the error the predicate matches', async () => {
    if (!live) return;
    const q = inferStatement(
      { bucket: 'test', scope: 'app', collection: EMPTY },
      100,
    );
    const err = await runSql(conn, q.statement, q.parameters).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ sqlppCode: 7014 });
    expect(isEmptyInferError(err)).toBe(true);
  });

  it('describes an empty collection with no columns', async () => {
    if (!live) return;
    const metadata = newMetadata();
    await expect(metadata.getColumns(tc(EMPTY))).resolves.toEqual([]);
    await expect(metadata.getAllFields(tc(EMPTY))).resolves.toEqual([]);
    await expect(
      metadata.getJSONKeys({ ...tc(EMPTY), column: 'LogAttributes' }),
    ).resolves.toEqual([]);
  });

  it('infers columns for a collection with documents', async () => {
    if (!live) return;
    const columns = await newMetadata().getColumns(tc(FILLED));
    expect(Object.fromEntries(columns.map(c => [c.name, c.type]))).toEqual({
      ServiceName: 'String',
      Duration: 'Int64',
      LogAttributes: 'Map(String, String)',
    });
  });

  it('picks up columns once an empty collection is populated', async () => {
    if (!live) return;
    const metadata = newMetadata();
    await expect(metadata.getColumns(tc(FILLING))).resolves.toEqual([]);
    await seed(FILLING, [{ ServiceName: 'api', Body: 'hello' }]);

    const now = Date.now();
    const clock = jest
      .spyOn(Date, 'now')
      .mockReturnValue(now + EMPTY_COLUMNS_CACHE_TTL_MS);
    try {
      const columns = await metadata.getColumns(tc(FILLING));
      expect(columns.map(c => c.name).sort()).toEqual(['Body', 'ServiceName']);
    } finally {
      clock.mockRestore();
    }
  });
});
