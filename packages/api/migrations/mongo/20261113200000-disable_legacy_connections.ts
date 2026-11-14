import type { Db } from 'mongodb';

const LEGACY_KINDS = new Set(['clickhouse', undefined]);

export async function up(db: Db): Promise<void> {
  const connections = db.collection('connections');
  const sources = db.collection('sources');

  await connections.updateMany(
    { $or: [{ kind: 'clickhouse' }, { kind: { $exists: false } }] },
    {
      $set: { kind: 'clickhouse', unsupported: true },
      $unset: { hyperdxSettingPrefix: '', isPrometheusEndpoint: '' },
    },
  );

  const legacyConnectionIds = await connections
    .find({ kind: 'clickhouse' })
    .project({ _id: 1 })
    .map(doc => doc._id)
    .toArray();

  if (legacyConnectionIds.length > 0) {
    await sources.updateMany(
      { connection: { $in: legacyConnectionIds.map(String) } },
      {
        $set: { disabled: true, disabledReason: 'clickhouse_removed' },
      },
    );
  }

  await sources.updateMany(
    { kind: 'promql' },
    { $set: { disabled: true, disabledReason: 'clickhouse_removed' } },
  );
}

export async function down(db: Db): Promise<void> {
  const connections = db.collection('connections');
  const sources = db.collection('sources');

  await connections.updateMany(
    { kind: 'clickhouse', unsupported: true },
    { $unset: { unsupported: '' } },
  );

  await sources.updateMany(
    { disabledReason: 'clickhouse_removed' },
    {
      $set: { disabled: false },
      $unset: { disabledReason: '' },
    },
  );
}