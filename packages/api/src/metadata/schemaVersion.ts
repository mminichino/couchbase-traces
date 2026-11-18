import {
  isSchemaNewer,
  METADATA_SCHEMA_KEY,
  METADATA_SCHEMA_VERSION,
  type MetadataSchemaDoc,
} from '@couchbase-traces/common-utils/dist/couchbase/metadataKeyspace';

import { SchemaVersionError } from '@/metadata/errors';
import type { MetaKv } from '@/metadata/types';

export { METADATA_SCHEMA_VERSION };

export async function readSchemaVersion(kv: MetaKv): Promise<number | null> {
  const doc = await kv.get<MetadataSchemaDoc>('system', METADATA_SCHEMA_KEY);
  const version = doc?.value.schemaVersion;
  return typeof version === 'number' ? version : null;
}

/**
 * Startup gate (plan D8): refuses to run against a bucket a newer release
 * wrote. Returns the stored version, or null when the marker is absent
 * (fresh bucket; provisioning writes it).
 */
export async function assertSchemaVersion(
  kv: MetaKv,
  code: number = METADATA_SCHEMA_VERSION,
): Promise<number | null> {
  const stored = await readSchemaVersion(kv);
  if (stored != null && isSchemaNewer(stored, code)) {
    throw new SchemaVersionError(stored, code);
  }
  return stored;
}

/** For the memory store and tests; production writes go through setup. */
export async function writeSchemaVersion(
  kv: MetaKv,
  now: Date = new Date(),
  appVersion?: string,
): Promise<void> {
  const prior = await kv.get<MetadataSchemaDoc>('system', METADATA_SCHEMA_KEY);
  const doc: MetadataSchemaDoc = {
    schemaVersion: METADATA_SCHEMA_VERSION,
    appVersion,
    provisionedAt: prior?.value.provisionedAt ?? now.toISOString(),
    updatedAt: now.toISOString(),
  };
  await kv.upsert('system', METADATA_SCHEMA_KEY, doc);
}
