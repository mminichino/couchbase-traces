import type { BaseResultSet, DataFormat } from '@clickhouse/client';

import type { ClickhouseClientOptions, QueryInputs } from '@/clickhouse';
import { ClickhouseClient } from '@/clickhouse/node';
import {
  type CouchbaseConnectionConfig,
  CouchbaseNodeClient,
} from '@/couchbase/node';
import type { DataClient } from '@/couchbase/types';
import type { TeamClickHouseSettings } from '@/types';

import { couchbaseChartQuery, couchbaseChartValidity } from './chartQuery';
import { resolveConnectionKind } from './kind';
import { queryViaCouchbase } from './routeQuery';

export class RoutingNodeClickhouseClient extends ClickhouseClient {
  readonly couchbaseSampleSize?: number;
  private readonly loadCouchbaseConnection: (
    id: string,
  ) => Promise<CouchbaseConnectionConfig>;
  private readonly team: TeamClickHouseSettings | null;
  // Init in constructor: tsup/esbuild emits invalid `call(this);,this.` when a
  // field initializer (__init) sits beside constructor body assignments.
  private readonly byConnection: Map<string, Promise<CouchbaseNodeClient>>;

  constructor(
    opts: ClickhouseClientOptions & {
      loadCouchbaseConnection: (
        id: string,
      ) => Promise<CouchbaseConnectionConfig>;
      team?: TeamClickHouseSettings | null;
    },
  ) {
    super(opts);
    this.byConnection = new Map();
    this.loadCouchbaseConnection = opts.loadCouchbaseConnection;
    this.team = opts.team ?? null;
    this.couchbaseSampleSize = opts.team?.metadataMaxRowsToRead;
  }

  couchbaseDataClient(): DataClient {
    return {
      requestTimeoutMs: this.requestTimeoutMs,
      query: async inputs => {
        const id = inputs.connectionId;
        if (!id) {
          throw new Error('A connection id is required for Couchbase queries');
        }
        const client = await this.clientFor(id);
        return client.query(inputs);
      },
      close: async () => {
        const clients = await Promise.all(this.byConnection.values());
        await Promise.all(clients.map(client => client.close()));
        this.byConnection.clear();
      },
    };
  }

  override async query<Format extends DataFormat>(
    inputs: QueryInputs<Format>,
  ): Promise<BaseResultSet<ReadableStream, Format>> {
    const kind = await resolveConnectionKind(inputs.connectionId);
    if (kind !== 'couchbase') return super.query(inputs);
    return queryViaCouchbase(this.couchbaseDataClient(), inputs);
  }

  override async queryChartConfig(
    args: Parameters<ClickhouseClient['queryChartConfig']>[0],
  ): ReturnType<ClickhouseClient['queryChartConfig']> {
    const routed = await couchbaseChartQuery(
      inputs => this.query(inputs),
      args,
    );
    if (routed === 'clickhouse') return super.queryChartConfig(args);
    return routed;
  }

  override async testChartConfigValidity(
    args: Parameters<ClickhouseClient['testChartConfigValidity']>[0],
  ): ReturnType<ClickhouseClient['testChartConfigValidity']> {
    const routed = await couchbaseChartValidity(
      inputs => this.query(inputs),
      args,
    );
    if (routed === 'clickhouse') return super.testChartConfigValidity(args);
    return routed;
  }

  override async close(): Promise<void> {
    await Promise.all([super.close(), this.couchbaseDataClient().close()]);
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
