import { MetadataCache } from '@/core/metadata';
import { Metadata as CouchbaseMetadata } from '@/couchbase/metadata';

import type { DataClientLike } from './clientLike';

export type { Metadata } from '@/couchbase/metadata';

let sharedCache: MetadataCache | undefined;

export function getMetadata(client: DataClientLike): CouchbaseMetadata {
  sharedCache ??= new MetadataCache();
  return new CouchbaseMetadata(client, sharedCache, {
    sampleSize:
      'metadataMaxRows' in client && typeof client.metadataMaxRows === 'number'
        ? client.metadataMaxRows
        : undefined,
  });
}
