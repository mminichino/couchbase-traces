type Doc = Record<string, unknown>;
type Filter = Doc & { $or?: Filter[] };

// A small in-memory stand-in for the parts of the Mongo driver the migration
// uses: updateMany with equality, $exists and $or filters, $set and $unset.
function matches(doc: Doc, filter: Filter): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    if (key === '$or') {
      return Array.isArray(cond) && cond.some(f => matches(doc, f));
    }
    if (cond != null && typeof cond === 'object' && '$exists' in cond) {
      return key in doc === (cond.$exists === true);
    }
    const value: unknown = Reflect.get(doc, key);
    return (value ?? null) === cond;
  });
}

function makeDb(docs: Doc[]) {
  const collection = {
    async updateMany(
      filter: Filter,
      update: { $set?: Doc; $unset?: Record<string, string> },
    ) {
      let modifiedCount = 0;
      for (const doc of docs) {
        if (!matches(doc, filter)) continue;
        modifiedCount++;
        Object.assign(doc, update.$set ?? {});
        for (const key of Object.keys(update.$unset ?? {})) {
          Reflect.deleteProperty(doc, key);
        }
      }
      return { modifiedCount };
    },
  };
  return {
    collection: jest.fn((name: string) => {
      expect(name).toBe('connections');
      return collection;
    }),
  };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const migration = require('../../migrations/mongo/20261112220000-add_kind_to_connections');

describe('add_kind_to_connections migration', () => {
  const seed = (): Doc[] => [
    { _id: 1, host: 'http://ch:8123' },
    { _id: 2, host: 'http://ch2:8123', kind: null },
    {
      _id: 3,
      kind: 'couchbase',
      host: 'couchbase://cb',
      wanProfile: true,
      tlsCaCertificate: 'pem',
    },
  ];

  it('marks connections without a kind as ClickHouse and is idempotent', async () => {
    const docs = seed();
    const db = makeDb(docs);
    await migration.up(db, {});
    const once = structuredClone(docs);
    await migration.up(db, {});

    expect(docs).toEqual(once);
    expect(docs.map(d => d.kind)).toEqual([
      'clickhouse',
      'clickhouse',
      'couchbase',
    ]);
    expect(docs[2]).toMatchObject({
      wanProfile: true,
      tlsCaCertificate: 'pem',
    });
  });

  it('removes the Couchbase fields on down and is idempotent', async () => {
    const docs = seed();
    const db = makeDb(docs);
    await migration.up(db, {});
    await migration.down(db, {});
    await migration.down(db, {});

    for (const doc of docs) {
      expect(doc).not.toHaveProperty('kind');
      expect(doc).not.toHaveProperty('wanProfile');
      expect(doc).not.toHaveProperty('tlsCaCertificate');
    }
    expect(docs[0]).toEqual({ _id: 1, host: 'http://ch:8123' });
  });
});
