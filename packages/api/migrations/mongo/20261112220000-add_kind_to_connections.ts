import { Db, MongoClient } from 'mongodb';

// Connections created before Couchbase support are ClickHouse connections.
// Both directions are idempotent.
module.exports = {
  async up(db: Db, _client: MongoClient) {
    await db
      .collection('connections')
      .updateMany(
        { $or: [{ kind: { $exists: false } }, { kind: null }] },
        { $set: { kind: 'clickhouse' } },
      );
  },
  async down(db: Db, _client: MongoClient) {
    await db
      .collection('connections')
      .updateMany(
        {},
        { $unset: { kind: '', wanProfile: '', tlsCaCertificate: '' } },
      );
  },
};
