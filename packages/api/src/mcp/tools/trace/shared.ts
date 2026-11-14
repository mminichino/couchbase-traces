import type { Metadata } from '@couchbase-traces/common-utils/dist/core/metadata';
import type { SqlFrag } from '@couchbase-traces/common-utils/dist/query';
import { sqlExpr } from '@couchbase-traces/common-utils/dist/query';
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

export type TimeFilterParams = {
  timestampValueExpression: string;
  metadata: Metadata;
  databaseName: string;
  tableName: string;
  connectionId: string;
};

export function inclusiveTimeFilter(
  params: TimeFilterParams,
  start: Date,
  end: Date,
): Promise<SqlFrag> {
  const expr = params.timestampValueExpression;
  return Promise.resolve(
    sqlExpr`(${expr} >= ${{ String: start.toISOString() }} AND ${expr} <= ${{ String: end.toISOString() }})`,
  );
}
