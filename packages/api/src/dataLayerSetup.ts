import { setConnectionKindResolver } from '@couchbase-traces/common-utils/dist/dataLayer';

import { setCouchbaseConnectionLoader } from '@/clickhouse';
import { toCouchbaseConnectionConfig } from '@/controllers/connection';
import Connection from '@/models/connection';

setConnectionKindResolver(async id => {
  const doc = await Connection.findById(id).select('kind').lean();
  if (doc == null) return undefined;
  return doc.kind === 'couchbase' ? 'couchbase' : 'clickhouse';
});

setCouchbaseConnectionLoader(async id => {
  const doc = await Connection.findById(id).select(
    '+password +tlsCaCertificate',
  );
  if (doc == null) {
    throw new Error(`Couchbase connection ${id} was not found`);
  }
  return toCouchbaseConnectionConfig(doc);
});
