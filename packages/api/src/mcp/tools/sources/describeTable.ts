import { trace } from '@opentelemetry/api';

import { getConnectionById } from '@/controllers/connection';
import { READ_ONLY_TOOL } from '@/mcp/tools/annotations';
import { MCP_DATA_CLIENT_OPTIONS } from '@/mcp/tools/query/helpers';
import type { ToolRegistrar } from '@/mcp/tools/types';
import { mcpServerError, mcpUserError, validateId } from '@/mcp/utils/errors';
import { assertMcpSliceForConnection } from '@/mcp/utils/mcpSlice';
import { MCP_TOOL_TIMEOUT_MS, runWithTimeout } from '@/mcp/utils/timeout';
import { DataClient } from '@/query';
import logger from '@/utils/logger';

import {
  describeCouchbaseTable,
  listCouchbaseTables,
} from './describeTableCouchbase';
import {
  describeTableSchema,
  MAX_SAMPLE_ROWS,
  validateDescribeTableInput,
} from './describeTableSchema';

export function registerDescribeTable({
  context,
  registerTool,
}: ToolRegistrar): void {
  const teamId = context.teamId.toString();

  registerTool(
    'cbt_describe_table',
    {
      title: 'Describe Database Table',
      annotations: READ_ONLY_TOOL,
      description:
        'Inspect Couchbase collections that are NOT registered as sources. ' +
        'For a source, call cbt_describe_source instead.\n\n' +
        `With table set, returns columns and optional sampleRows (up to ${MAX_SAMPLE_ROWS}). ` +
        'Without table, lists collections in the bucket, paginated via nextCursor.',
      inputSchema: describeTableSchema,
    },
    async rawInput => {
      const input = describeTableSchema.parse(rawInput);

      const invalid = validateDescribeTableInput(input);
      if (invalid) return mcpUserError(invalid);
      const invalidId = validateId(input.connectionId, 'connectionId');
      if (invalidId) return invalidId;

      trace.getActiveSpan()?.setAttributes({
        'mcp.describe_table.mode': input.table ? 'describe' : 'list',
        'mcp.describe_table.connection_id': input.connectionId,
        'mcp.describe_table.database': input.database,
        ...(input.table && { 'mcp.describe_table.table': input.table }),
      });

      const connection = await getConnectionById(
        teamId,
        input.connectionId,
        true,
      );
      if (!connection) {
        return mcpUserError(
          `Connection "${input.connectionId}" not found. Call cbt_list_sources to see available connections.`,
        );
      }

      const sliceErr = await assertMcpSliceForConnection(input.connectionId);
      if (sliceErr) return sliceErr;

      if (connection.kind !== 'couchbase' || connection.unsupported) {
        return mcpUserError(
          'This connection used ClickHouse, which is no longer supported.',
        );
      }

      const dataClient = new DataClient(MCP_DATA_CLIENT_OPTIONS);

      const outcome = await runWithTimeout(
        signal => {
          const couchCtx = {
            dataClient,
            connectionId: input.connectionId,
            signal,
          };
          return input.table
            ? describeCouchbaseTable(couchCtx, {
                ...input,
                table: input.table,
                teamId,
              })
            : listCouchbaseTables(couchCtx, input);
        },
        { timeoutMs: MCP_TOOL_TIMEOUT_MS },
      );
      if (!outcome.timedOut) return outcome.value;

      logger.warn(
        { teamId, connectionId: input.connectionId, database: input.database },
        'cbt_describe_table timed out',
      );
      return mcpServerError(
        'cbt_describe_table timed out. The cluster may be under load; try again.',
      );
    },
  );
}
