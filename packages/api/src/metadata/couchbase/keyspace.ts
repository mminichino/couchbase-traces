import { keyspace } from '@couchbase-traces/common-utils/dist/couchbase/sqlpp';
import type { Keyspace } from '@couchbase-traces/common-utils/dist/couchbase/types';

import type { MetaCollection } from '@/metadata/types';

type Target = { bucket: string; scope: string };

export function metaCollection(
  t: Target,
  collection: MetaCollection,
): Keyspace {
  return { bucket: t.bucket, scope: t.scope, collection };
}

/** Backtick-quoted `bucket`.`scope`.`collection` via the shared helper. */
export function metaKeyspaceSql(t: Target, collection: MetaCollection): string {
  return keyspace(metaCollection(t, collection));
}
