// Server only: the Couchbase SDK is a native addon. Browser code must not
// import this module; packages/app enforces that with no-restricted-imports.
import {
  mergeQueryAttribution,
  type QueryAttribution,
} from '@/query/attribution';
import type { TeamQuerySettings } from '@/types';

import { getCurrentQueryAttribution } from './nodeAttribution';
import {
  type CouchbaseConnectionConfig,
  getCouchbaseLogger,
  getCouchbaseRuntimeConfig,
  type Logger,
} from './nodeCluster';
import { executeQuery } from './nodeExecute';
import { appendQueryCapture } from './queryCapture';
import { fromFrames } from './resultset';
import { buildClientContextId } from './settings';
import type {
  CouchbaseFormat,
  CouchbaseQueryInputs,
  CouchbaseResultSet,
  DataClient,
} from './types';

export {
  type ClusterKey,
  type CouchbaseConnectionConfig,
  type CouchbaseRuntimeConfig,
  getCouchbaseRuntimeConfig,
  type Logger,
  setCouchbaseLogger,
} from './nodeCluster';
export {
  ClusterCache,
  clusterCache,
  type ClusterCacheOptions,
  type ClusterLease,
} from './nodeClusterCache';
export { executeQuery } from './nodeExecute';
export {
  NO_INDEX_MESSAGE,
  testConnection,
  testKeyspace,
  type TestResult,
} from './nodeTest';

// Node client
// ---------------------------------------------------------------------------

export class CouchbaseNodeClient implements DataClient {
  readonly requestTimeoutMs: number = 3600000;
  /** Team `metadataMaxRowsToRead`, kept for the metadata layer (Phase 6). */
  readonly metadataMaxRows?: number;
  private readonly conn: CouchbaseConnectionConfig;
  private readonly team: TeamQuerySettings | null;
  private readonly logger: Logger;
  private readonly attribution?: QueryAttribution;
  private readonly open = new Set<CouchbaseResultSet<CouchbaseFormat>>();

  constructor(opts: {
    conn: CouchbaseConnectionConfig;
    team?: TeamQuerySettings | null;
    requestTimeout?: number;
    logger?: Logger;
    attribution?: QueryAttribution;
  }) {
    this.conn = opts.conn;
    this.team = opts.team ?? null;
    this.logger = opts.logger ?? getCouchbaseLogger();
    this.attribution = opts.attribution;
    this.metadataMaxRows = this.team?.metadataMaxRowsToRead;
    if (opts.requestTimeout != null && opts.requestTimeout >= 0) {
      this.requestTimeoutMs = opts.requestTimeout;
    }
  }

  async query<F extends CouchbaseFormat>(
    inputs: CouchbaseQueryInputs<F>,
  ): Promise<CouchbaseResultSet<F>> {
    const cfg = getCouchbaseRuntimeConfig();
    const format: CouchbaseFormat = inputs.format ?? 'JSON';
    const timeoutSignal = AbortSignal.timeout(this.requestTimeoutMs);
    const signal = inputs.abort_signal
      ? AbortSignal.any([inputs.abort_signal, timeoutSignal])
      : timeoutSignal;
    const attribution = mergeQueryAttribution(
      this.attribution,
      getCurrentQueryAttribution(),
      inputs.attribution,
    );
    const merged = {
      ...inputs,
      attribution,
      queryId: buildClientContextId(inputs.queryId, attribution),
    };
    // Acceptance: append NDJSON when CBT_QUERY_CAPTURE_FILE is set (disabled by default).
    appendQueryCapture({
      statement: inputs.query,
      parameters: inputs.query_params ?? null,
      connectionId: inputs.connectionId ?? null,
      queryContext: inputs.queryContext ?? null,
    });
    const frames = executeQuery({
      conn: this.conn,
      inputs: merged,
      team: this.team,
      signal,
      frameRows: cfg.frameRows,
      logger: this.logger,
    });
    const rs = fromFrames<F>(frames, format, merged.queryId, {
      maxBufferedBytes: cfg.maxBufferedBytes,
      statement: inputs.query,
    });
    this.open.add(rs);
    return rs;
  }

  async close(): Promise<void> {
    for (const rs of this.open) rs.close();
    this.open.clear();
  }
}
