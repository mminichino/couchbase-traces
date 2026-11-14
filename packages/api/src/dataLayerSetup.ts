import { setCouchbaseConnectionLoader } from '@/clickhouse';
import { toCouchbaseConnectionConfig } from '@/controllers/connection';
import Connection from '@/models/connection';

setCouchbaseConnectionLoader(async id => {
  const doc = await Connection.findById(id).select(
    '+password +tlsCaCertificate',
  );
  if (doc == null) {
    throw new Error(`Couchbase connection ${id} was not found`);
  }
  return toCouchbaseConnectionConfig(doc);
});
