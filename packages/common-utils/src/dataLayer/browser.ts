import type { BaseResultSet, DataFormat } from '@clickhouse/client-web';

import type { ClickhouseClientOptions, QueryInputs } from '@/clickhouse';
import { ClickhouseClient } from '@/clickhouse/browser';
import { CouchbaseClient } from '@/couchbase/browser';
import type { DataClient } from '@/couchbase/types';

import { couchbaseChartQuery, couchbaseChartValidity } from './chartQuery';
import { resolveConnectionKind } from './kind';
import { queryViaCouchbase } from './routeQuery';

export class RoutingClickhouseClient extends ClickhouseClient {
  private readonly couchbaseClient: CouchbaseClient;

  constructor(
    opts: ClickhouseClientOptions & { couchbase?: { requestTimeout?: number } },
  ) {
    super(opts);
    this.couchbaseClient = new CouchbaseClient({
      requestTimeout: opts.couchbase?.requestTimeout ?? opts.requestTimeout,
      attribution: opts.attribution,
    });
  }

  couchbaseDataClient(): DataClient {
    return this.couchbaseClient;
  }

  override async query<Format extends DataFormat>(
    inputs: QueryInputs<Format>,
  ): Promise<BaseResultSet<ReadableStream, Format>> {
    const kind = await resolveConnectionKind(inputs.connectionId);
    if (kind !== 'couchbase') return super.query(inputs);
    return queryViaCouchbase(this.couchbaseClient, inputs);
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
    await Promise.all([super.close(), this.couchbaseClient.close()]);
  }
}

export function getDataClient(
  opts: ClickhouseClientOptions & { couchbase?: { requestTimeout?: number } },
): RoutingClickhouseClient {
  return new RoutingClickhouseClient(opts);
}
