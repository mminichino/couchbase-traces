import type { BaseResultSet, DataFormat, QueryInputs } from '@/clickhouse';
import {
  COUCHBASE_FORMATS,
  type CouchbaseFormat,
  type DataClient,
} from '@/couchbase/types';

import { CouchbaseUnsupportedError } from './errors';

export function assertCouchbaseFormat(
  format: string | undefined,
): CouchbaseFormat {
  const name = format ?? 'JSON';
  const found = COUCHBASE_FORMATS.find(candidate => candidate === name);
  if (found == null) throw new CouchbaseUnsupportedError(`format ${name}`);
  return found;
}

/** Maps a ClickHouse query call onto the Phase 4 client. The result is cast at the type boundary. */
export async function queryViaCouchbase<Format extends DataFormat>(
  client: DataClient,
  inputs: QueryInputs<Format>,
): Promise<BaseResultSet<ReadableStream, Format>> {
  const format = assertCouchbaseFormat(inputs.format);
  const result = await client.query({
    query: inputs.query,
    query_params: inputs.query_params,
    format,
    abort_signal: inputs.abort_signal,
    connectionId: inputs.connectionId,
    queryId: inputs.queryId,
    attribution: inputs.attribution,
    clickhouse_settings: plainSettings(inputs.clickhouse_settings),
  });
  // One implementation cannot satisfy the format conditional (JSON is `never`
  // for stream, while JSONEachRow is a stream). Callers use these methods.
  return {
    query_id: result.query_id,
    response_headers: {},
    text: () => result.text(),
    // @ts-expect-error format conditional is not one return type
    json: () => result.json(),
    // @ts-expect-error format conditional is not one return type
    stream: () => result.stream(),
    close: () => result.close(),
  };
}

function plainSettings(value: unknown): Record<string, unknown> | undefined {
  if (value == null || typeof value !== 'object') return undefined;
  return Object.fromEntries(Object.entries(value));
}
