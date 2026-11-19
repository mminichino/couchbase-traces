import { toCouchbaseConnectionConfig } from '@/controllers/connection';
import { setCouchbaseConnectionLoader } from '@/dataClient';
import { getMetadataStore } from '@/metadata';

setCouchbaseConnectionLoader(async id => {
  const doc = await getMetadataStore().connections.getWithSecrets(id);
  if (doc == null) {
    throw new Error(`Couchbase connection ${id} was not found`);
  }
  return toCouchbaseConnectionConfig(doc);
});
