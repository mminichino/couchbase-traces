import { CouchbaseClient } from '@/couchbase/browser';

import { runChartQuery, runChartValidity } from './chartQuery';
import type { DataClientLike, DataClientOptions } from './clientLike';

export type { DataClientOptions };

export class DataClient extends CouchbaseClient implements DataClientLike {
  queryChartConfig: DataClientLike['queryChartConfig'] = args =>
    runChartQuery(this, args);
  testChartConfigValidity: DataClientLike['testChartConfigValidity'] = args =>
    runChartValidity(this, args);
}

/** @deprecated Use DataClient */
export const ClickhouseClient = DataClient;

export async function testLocalConnection(_args: {
  host: string;
  username: string;
  password: string;
}): Promise<boolean> {
  return false;
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
