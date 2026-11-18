import {
  type MetadataVerifyResult,
  verifyMetadataKeyspace,
  waitForMetadataIndexes,
} from '@couchbase-traces/common-utils/dist/couchbase/nodeMetadataIndexes';
import { ensureMetadataKeyspace } from '@couchbase-traces/common-utils/dist/couchbase/nodeMetadataProvision';
import type { Cluster } from 'couchbase';

import type { MetadataConfig } from '@/metadata/couchbase/config';
import { fromCouchbaseError, IndexNotReadyError } from '@/metadata/errors';

export type { MetadataVerifyResult };

export type VerifyDeps = {
  verify?: typeof verifyMetadataKeyspace;
  provision?: typeof ensureMetadataKeyspace;
  wait?: typeof waitForMetadataIndexes;
  log?: (line: string) => void;
};

/**
 * Startup keyspace check (plan §2.6). Without auto-provisioning the API never
 * runs DDL: a missing scope, collection, or index is reported, and building
 * indexes are waited on up to `indexWaitMs`. With CBT_METADATA_AUTO_PROVISION
 * it runs the same idempotent ensure code as `couchbase-init`, minus bucket
 * and user creation (those need cluster admin rights).
 */
export async function verifyOrProvision(
  cluster: Cluster,
  cfg: MetadataConfig,
  deps: VerifyDeps = {},
  appVersion?: string,
): Promise<MetadataVerifyResult> {
  const verify = deps.verify ?? verifyMetadataKeyspace;
  const log = deps.log ?? (() => undefined);
  const target = { bucket: cfg.bucket, scope: cfg.scope };
  try {
    let result = await verify(cluster, target);
    if (result.missing.length > 0 && cfg.autoProvision) {
      await (deps.provision ?? ensureMetadataKeyspace)(cluster, {
        ...target,
        ramMb: 0,
        replicas: 0,
        indexReplicas: 0,
        createBucket: false,
        appVersion,
        waitTimeoutS: Math.ceil(cfg.indexWaitMs / 1000),
        log,
      });
      result = await verify(cluster, target);
    }
    if (result.missing.length === 0 && result.building.length > 0) {
      try {
        await (deps.wait ?? waitForMetadataIndexes)(cluster, {
          ...target,
          waitTimeoutS: Math.ceil(cfg.indexWaitMs / 1000),
        });
        result = await verify(cluster, target);
      } catch {
        // Still building: readiness reports `indexing` and start() retries.
      }
    }
    return result;
  } catch (err) {
    throw fromCouchbaseError(err, { secrets: [cfg.password] });
  }
}

export function describeVerify(result: MetadataVerifyResult): string[] {
  return [
    ...result.missing.map(m => `missing ${m}`),
    ...result.building.map(b => `building index ${b}`),
  ];
}

export function assertVerified(result: MetadataVerifyResult): void {
  if (!result.ok) {
    throw new IndexNotReadyError(
      `Metadata keyspace not ready: ${describeVerify(result).join(', ')}`,
    );
  }
}
