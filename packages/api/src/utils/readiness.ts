import mongoose from 'mongoose';

import { isMetadataReadyOrDisabled, metadataReadiness } from '@/metadata';
import type { MetadataState } from '@/metadata/types';
import { mongooseConnection } from '@/models';

/**
 * Readiness helpers shared by the API and OpAMP servers.
 *
 * Both servers expose:
 *   - `/health`: pure liveness — 200 whenever the process can serve HTTP.
 *     Orchestrators restart on liveness failures, and restarting does not fix
 *     a dependency outage, so `/health` deliberately checks nothing external.
 *   - `/ready`: readiness — 503 unless MongoDB is connected, since almost
 *     every request (including OpAMP config handling) is Mongo-backed, and
 *     unless the Couchbase metadata store (when configured) is ready. The
 *     body names both states while either is down.
 *     Kubernetes readiness failures take the pod out of Service endpoints
 *     without restarting it (https://github.com/mminichino/couchbase-traces/issues/2966).
 */
export const isMongoConnected = () =>
  mongooseConnection.readyState === mongoose.ConnectionStates.connected;

export const mongoReadyStateName = () =>
  mongoose.STATES[mongooseConnection.readyState] ??
  String(mongooseConnection.readyState);

export type ReadinessReport = {
  ready: boolean;
  mongo: string;
  metadata: MetadataState;
};

export const readinessReport = (): ReadinessReport => ({
  ready: isMongoConnected() && isMetadataReadyOrDisabled(),
  mongo: mongoReadyStateName(),
  metadata: metadataReadiness().state,
});
