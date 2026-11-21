import type { SqlPP } from '@couchbase-traces/common-utils/dist/couchbase/sqlpp';
import type { TraceTable } from '@couchbase-traces/common-utils/dist/couchbase/traceQueries';
import type { QuerySettings } from '@couchbase-traces/common-utils/dist/types';

import { getConnectionById } from '@/controllers/connection';
import { MCP_REQUEST_TIMEOUT } from '@/mcp/tools/query/helpers';
import type { McpErrorResult } from '@/mcp/utils/errors';
import { mcpUserError } from '@/mcp/utils/errors';
import { assertMcpSliceForConnection } from '@/mcp/utils/mcpSlice';
import { DataClient } from '@/query';

export function durationDivisor(precision: number): number {
  return Math.pow(10, Math.max(0, precision - 3));
}

export async function getMcpDataClient(
  teamId: string,
  connectionId: string,
): Promise<DataClient | null> {
  const connection = await getConnectionById(teamId, connectionId, true);
  if (
    connection == null ||
    connection.kind !== 'couchbase' ||
    connection.unsupported
  ) {
    return null;
  }
  return new DataClient({ requestTimeout: MCP_REQUEST_TIMEOUT });
}

/** Slice guard + connection resolution for trace MCP tools. */
export async function requireMcpDataClient(
  teamId: string,
  connectionId: string,
): Promise<DataClient | McpErrorResult> {
  const sliceErr = await assertMcpSliceForConnection(connectionId);
  if (sliceErr) return sliceErr;
  const client = await getMcpDataClient(teamId, connectionId);
  if (!client) {
    return mcpUserError(`Connection not found: ${connectionId}`);
  }
  return client;
}

export function mcpQuerySettings(_querySettings: QuerySettings | undefined) {
  return undefined;
}

/** The keyspace and timestamp fields the trace SQL++ builders read. */
export function traceTable(source: {
  from: TraceTable['from'];
  timestampValueExpression: string;
  timestampFormat?: TraceTable['timestampFormat'];
}): TraceTable {
  return {
    from: source.from,
    timestampValueExpression: source.timestampValueExpression,
    timestampFormat: source.timestampFormat,
  };
}

/** Runs a built SQL++ statement and returns its rows. */
export async function runRows<T>(
  dataClient: DataClient,
  q: SqlPP,
  connectionId: string,
): Promise<T[]> {
  const result = await dataClient.query({
    query: q.statement,
    query_params: q.parameters,
    format: 'JSONEachRow',
    connectionId,
  });
  return (await (result as { json: () => Promise<T[]> }).json()) ?? [];
}
