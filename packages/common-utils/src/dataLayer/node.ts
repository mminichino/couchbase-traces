import { AsyncLocalStorage } from 'node:async_hooks';

import {
  type CouchbaseConnectionConfig,
  CouchbaseNodeClient,
} from '@/couchbase/node';
import {
  mergeQueryAttribution,
  type QueryAttribution,
} from '@/query/attribution';
import type { TeamQuerySettings } from '@/types';

import { runChartQuery, runChartValidity } from './chartQuery';
import type { DataClientLike, DataClientOptions } from './clientLike';

export type { DataClientOptions };

const attributionStore = new AsyncLocalStorage<QueryAttribution>();

export function withQueryAttribution<T>(
  attribution: QueryAttribution,
  fn: () => T,
): T {
  const merged = mergeQueryAttribution(
    attributionStore.getStore(),
    attribution,
  );
  return attributionStore.run(merged, fn);
}

export function getCurrentQueryAttribution(): QueryAttribution | undefined {
  return attributionStore.getStore();
}

/** @deprecated Integration tests should use DataClient from the API package. */
export function createNativeClient(_opts: Record<string, unknown> = {}): never {
  throw new Error(
    'createNativeClient was removed; use DataClient with a connection id',
  );
}

export class NodeDataClient implements DataClientLike {
  readonly requestTimeoutMs: number;
  readonly metadataMaxRows?: number;
  private readonly team: TeamQuerySettings | null;
  private readonly loadCouchbaseConnection: (
    id: string,
  ) => Promise<CouchbaseConnectionConfig>;
  private readonly attribution?: DataClientOptions['attribution'];
  private readonly byConnection = new Map<
    string,
    Promise<CouchbaseNodeClient>
  >();

  constructor(
    opts: DataClientOptions & {
      loadCouchbaseConnection: (
        id: string,
      ) => Promise<CouchbaseConnectionConfig>;
      team?: TeamQuerySettings | null;
    },
  ) {
    this.loadCouchbaseConnection = opts.loadCouchbaseConnection;
    this.team = opts.team ?? null;
    this.attribution = opts.attribution;
    this.metadataMaxRows = opts.team?.metadataMaxRowsToRead;
    this.requestTimeoutMs = opts.requestTimeout ?? 3600000;
  }

  async query(...args: Parameters<DataClientLike['query']>) {
    const inputs = args[0];
    const id = inputs.connectionId;
    if (!id) {
      throw new Error('A connection id is required for Couchbase queries');
    }
    const client = await this.clientFor(id);
    return client.query(inputs);
  }

  queryChartConfig: DataClientLike['queryChartConfig'] = args =>
    runChartQuery(this, args);

  testChartConfigValidity: DataClientLike['testChartConfigValidity'] = args =>
    runChartValidity(this, args);

  async close(): Promise<void> {
    const clients = await Promise.all(this.byConnection.values());
    await Promise.all(clients.map(c => c.close()));
    this.byConnection.clear();
  }

  private clientFor(id: string): Promise<CouchbaseNodeClient> {
    const existing = this.byConnection.get(id);
    if (existing) return existing;
    const created = this.loadCouchbaseConnection(id).then(
      conn =>
        new CouchbaseNodeClient({
          conn,
          team: this.team,
          requestTimeout: this.requestTimeoutMs,
          attribution: this.attribution,
        }),
    );
    this.byConnection.set(id, created);
    created.catch(() => {
      this.byConnection.delete(id);
    });
    return created;
  }
}

export { NodeDataClient as DataClient };
