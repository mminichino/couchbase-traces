import { trace } from '@opentelemetry/api';
import { z } from 'zod';

import { READ_ONLY_TOOL } from '@/mcp/tools/annotations';
import type { ToolRegistrar } from '@/mcp/tools/types';
import { mcpUserError } from '@/mcp/utils/errors';

import { BUILDER_TOOLS_LIST, SQL_FALLBACK_CRITERIA } from './builderCatalog';
import { parseTimeRange, runConfigTile } from './helpers';
import { createSourceLookup, prepareSqlQuery } from './prepareSql';
import { endTimeSchema, startTimeSchema } from './schemas';
import {
  MAX_SQL_BATCH_QUERIES,
  runSqlBatch,
  SQL_BATCH_DEADLINE_MS,
  sqlBatchQuerySchema,
} from './sqlBatch';
import {
  RAW_SQL_PARAM_DESCRIPTION,
  RAW_SQL_TOOL_DESCRIPTION,
} from './sqlDescriptions';

// ─── Schema ──────────────────────────────────────────────────────────────────

const sqlSchema = z.object({
  connectionId: z
    .string()
    .describe(
      'Connection to query. This is the only query tool that takes a connectionId ' +
        'instead of sourceId. Call cbt_list_sources to find available connections.',
    ),
  sourceId: z
    .string()
    .optional()
    .describe(
      'Source ID. Set it when the query reads a table backed by a source, so ' +
        "`$__sourceTable` expands to that source's database.table. The source's " +
        'connection must match connectionId. Call cbt_list_sources to find source IDs.',
    ),
  sql: z.string().optional().describe(RAW_SQL_PARAM_DESCRIPTION),
  queries: z
    .array(sqlBatchQuerySchema)
    .min(1)
    .max(MAX_SQL_BATCH_QUERIES)
    .optional()
    .describe(
      `Up to ${MAX_SQL_BATCH_QUERIES} independent queries to run in parallel instead of sql. ` +
        'They share startTime/endTime and default to the top-level connectionId and sourceId.',
    ),
  startTime: startTimeSchema,
  endTime: endTimeSchema,
});

const SQL_OR_QUERIES_ERROR =
  'Pass exactly one of sql (a single query) or queries (several independent ' +
  'queries run in parallel).';

// ─── Tool registration ───────────────────────────────────────────────────────

export function registerSql({ context, registerTool }: ToolRegistrar) {
  const { teamId } = context;

  registerTool(
    'cbt_sql',
    {
      title: 'Raw SQL Query',
      // Enforces legacy store readonly=2, so effectively read-only.
      annotations: READ_ONLY_TOOL,
      description:
        `${RAW_SQL_TOOL_DESCRIPTION}\n\nPrefer:\n${BUILDER_TOOLS_LIST}\n\n` +
        `Use raw SQL only when a builder cannot (${SQL_FALLBACK_CRITERIA}). ` +
        `Batch budget: ${SQL_BATCH_DEADLINE_MS / 1000}s per call.`,
      inputSchema: sqlSchema,
    },
    async input => {
      const timeRange = parseTimeRange(input.startTime, input.endTime);
      if ('error' in timeRange) {
        return mcpUserError(timeRange.error);
      }
      const { startDate, endDate } = timeRange;

      const { sql, queries } = input;
      if (queries !== undefined) {
        if (sql !== undefined) {
          return mcpUserError(SQL_OR_QUERIES_ERROR);
        }
        trace.getActiveSpan()?.setAttribute('mcp.sql.mode', 'batch');
        return runSqlBatch({
          teamId: teamId.toString(),
          queries,
          defaults: {
            connectionId: input.connectionId,
            sourceId: input.sourceId,
          },
          startDate,
          endDate,
        });
      }

      if (sql === undefined) {
        return mcpUserError(SQL_OR_QUERIES_ERROR);
      }
      trace.getActiveSpan()?.setAttribute('mcp.sql.mode', 'single');
      const prepared = await prepareSqlQuery(
        {
          sql,
          connectionId: input.connectionId,
          sourceId: input.sourceId,
        },
        createSourceLookup(teamId.toString()),
      );
      if ('error' in prepared) {
        return prepared.error;
      }

      return runConfigTile(
        teamId.toString(),
        prepared.tile,
        startDate,
        endDate,
      );
    },
  );
}
