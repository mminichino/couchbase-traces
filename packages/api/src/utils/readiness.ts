import { isMetadataReady, metadataReadiness } from '@/metadata';
import type { MetadataState } from '@/metadata/types';

/**
 * Readiness helpers shared by the API and OpAMP servers.
 *
 * Both servers expose:
 *   - `/health`: pure liveness — 200 whenever the process can serve HTTP.
 *     Orchestrators restart on liveness failures, and restarting does not fix
 *     a dependency outage, so `/health` deliberately checks nothing external.
 *   - `/ready`: readiness — 503 unless the Couchbase metadata store is ready,
 *     since almost every request (including OpAMP config handling) reads
 *     teams, sources, or sessions from it. The body names the metadata state
 *     while it is down.
 *     Kubernetes readiness failures take the pod out of Service endpoints
 *     without restarting it (https://github.com/mminichino/couchbase-traces/issues/2966).
 */
export type ReadinessReport = {
  ready: boolean;
  metadata: MetadataState;
};

export const readinessReport = (): ReadinessReport => ({
  ready: isMetadataReady(),
  metadata: metadataReadiness().state,
});
