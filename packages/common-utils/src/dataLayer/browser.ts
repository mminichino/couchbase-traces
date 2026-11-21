import { CouchbaseClient } from '@/couchbase/browser';

import { runChartQuery, runChartValidity } from './chartQuery';
import type { DataClientLike, DataClientOptions } from './clientLike';

export type { DataClientOptions };

export class DataClient extends CouchbaseClient implements DataClientLike {
  constructor(opts: ConstructorParameters<typeof CouchbaseClient>[0] = {}) {
    super(opts);
  }

  queryChartConfig: DataClientLike['queryChartConfig'] = args =>
    runChartQuery(this, args);
  testChartConfigValidity: DataClientLike['testChartConfigValidity'] = args =>
    runChartValidity(this, args);
}

export function getDataClient(
  opts: DataClientOptions & {
    application?: string;
    fetchImpl?: typeof fetch;
    baseUrl?: string;
    headers?: () => Record<string, string> | Promise<Record<string, string>>;
    maxBufferedBytes?: number;
  } = {},
): DataClient {
  return new DataClient(opts);
}
