/**
 * cbt_trace_top_time_consuming_operations
 *
 * Aggregate counterpart to cbt_trace_waterfall. Given a parent-span
 * filter (a service + operation, optionally constrained to slow durations),
 * return the child operations consuming the most cumulative time across all
 * traces matching the parent filter — ranked by total_time_ms DESC.
 *
 * Same SQL pattern the in-app `ServiceDashboardEndpointPerformanceChart`
 * uses: subselect distinct TraceIds matching the parent, then aggregate
 * all spans in those traces, excluding the matching root.
 *
 * Why this exists: incident-triage agents that anchor on the first slow
 * endpoint they find need a way to ask "what's downstream of THIS slow
 * endpoint" without dropping into raw SQL with self-JOINs. The builder
 * tools (table / timeseries / search) can't express the TraceId subselect.
 */
import type { SqlPP } from '@couchbase-traces/common-utils/dist/couchbase/sqlpp';
import { traceBreakdownQuery } from '@couchbase-traces/common-utils/dist/couchbase/traceQueries';
import { SourceKind } from '@couchbase-traces/common-utils/dist/types';

import { getSource } from '@/controllers/sources';
import { READ_ONLY_TOOL } from '@/mcp/tools/annotations';
import {
  isQueryOutOfTime,
  isServerError,
  parseTimeRange,
  queryErrorResult,
} from '@/mcp/tools/query/helpers';
import {
  TRACE_BREAKDOWN_DESCRIPTION,
  type TraceBreakdownInput,
  traceBreakdownSchema,
} from '@/mcp/tools/trace/breakdownSchema';
import {
  durationDivisor,
  requireMcpDataClient,
  runRows,
  traceTable,
} from '@/mcp/tools/trace/shared';
import type { ToolRegistrar } from '@/mcp/tools/types';
import { mcpUserError } from '@/mcp/utils/errors';

// The child stage looks spans up by TraceId, which no time-ordered index
// covers, so
// it reads every span in the window regardless of how few parents matched.
// Cost tracks the window length, so that is the first thing to shrink.
const TIMEOUT_SUFFIX =
  'This tool reads every span in the time window to find the children of ' +
  'matching traces, so cost grows with the window length. Retry with a ' +
  'shorter startTime/endTime window (e.g. 15-60 minutes around the ' +
  'incident), scope parentFilter to one ServiceName AND SpanName, set ' +
  'minParentDurationMs to break down only slow parents, or lower ' +
  'maxParentTraces.';

const INVALID_FILTER_SUFFIX =
  "The parentFilter must be a valid SQL++ condition referencing columns on the trace table (e.g. ServiceName = 'X' AND SpanName = 'Y').";

export function registerTraceBreakdown({
  context,
  registerTool,
}: ToolRegistrar) {
  const { teamId } = context;

  registerTool(
    'cbt_trace_top_time_consuming_operations',
    {
      title: 'Top Time-Consuming Operations Across Matching Traces',
      annotations: READ_ONLY_TOOL,
      description: TRACE_BREAKDOWN_DESCRIPTION,
      inputSchema: traceBreakdownSchema,
    },
    async (rawInput: TraceBreakdownInput) => {
      const input = traceBreakdownSchema.parse(rawInput);

      const timeRange = parseTimeRange(input.startTime, input.endTime);
      if ('error' in timeRange) {
        return mcpUserError(timeRange.error);
      }
      const { startDate, endDate } = timeRange;

      const source = await getSource(teamId.toString(), input.sourceId);
      if (!source) {
        return mcpUserError(
          `Source not found: ${input.sourceId}. Call cbt_list_sources to find available source IDs.`,
        );
      }
      if (source.kind !== SourceKind.Trace) {
        return mcpUserError(
          `Source ${input.sourceId} is kind="${source.kind}". cbt_trace_top_time_consuming_operations requires a source of kind="trace".`,
        );
      }

      const dataClient = await requireMcpDataClient(
        teamId.toString(),
        source.connection.toString(),
      );
      if ('isError' in dataClient) {
        return dataClient;
      }

      // Child spans can start slightly before or end slightly after the
      // parent sampling window, so their window is 60s wider on each side.
      const divisor = durationDivisor(source.durationPrecision);
      let query: SqlPP;
      try {
        query = traceBreakdownQuery({
          table: traceTable(source),
          exprs: {
            traceId: source.traceIdExpression,
            serviceName: source.serviceNameExpression,
            spanName: source.spanNameExpression,
            duration: source.durationExpression,
          },
          parentFilter: input.parentFilter,
          parentStart: startDate,
          parentEnd: endDate,
          childStart: new Date(startDate.getTime() - 60_000),
          childEnd: new Date(endDate.getTime() + 60_000),
          minParentDurationStored:
            input.minParentDurationMs != null
              ? input.minParentDurationMs * divisor
              : undefined,
          divisor,
          maxParentTraces: input.maxParentTraces,
          topN: input.topN,
        });
      } catch (e) {
        // Building fails only on the source's own expressions (an unsupported
        // timestamp expression or an unquotable key), not on the window.
        return queryErrorResult(e, 'Failed to compute breakdown');
      }

      type Row = {
        service: string;
        operation: string;
        total_time_ms: number | string;
        calls: number | string;
        in_parents: number | string;
        p50_ms: number | string;
        p99_ms: number | string;
      };

      let rows: Row[];
      try {
        rows = await runRows<Row>(
          dataClient,
          query,
          source.connection.toString(),
        );
      } catch (e) {
        return queryErrorResult(e, {
          prefix: 'Failed to compute breakdown',
          suffix: isQueryOutOfTime(e)
            ? TIMEOUT_SUFFIX
            : isServerError(e)
              ? undefined
              : INVALID_FILTER_SUFFIX,
        });
      }

      // Normalise numerics (upstream JSON returned 64-bit integers as
      // strings) and compute each row's share of total time.
      const operations = rows.map(r => ({
        service: r.service,
        operation: r.operation,
        totalTimeMs: Number(r.total_time_ms),
        calls: Number(r.calls),
        inParents: Number(r.in_parents),
        p50Ms: Number(r.p50_ms),
        p99Ms: Number(r.p99_ms),
      }));
      const grandTotalMs = operations.reduce(
        (acc, r) => acc + r.totalTimeMs,
        0,
      );
      const operationsWithShare = operations.map(r => ({
        ...r,
        shareOfTotalTime: grandTotalMs > 0 ? r.totalTimeMs / grandTotalMs : 0,
      }));

      const output = {
        summary: {
          parentFilter: input.parentFilter,
          startTime: startDate.toISOString(),
          endTime: endDate.toISOString(),
          minParentDurationMs: input.minParentDurationMs ?? null,
          operationsReturned: operationsWithShare.length,
          topN: input.topN,
          grandTotalTimeMs: grandTotalMs,
          hint:
            operationsWithShare.length === 0
              ? 'No matching parent traces, or all matching traces had no other spans. Widen the time window, relax the parentFilter, or lower minParentDurationMs.'
              : "Operations are sorted by total_time_ms (sum of child Duration). shareOfTotalTime is each row's share of the cumulative child time across all matching traces.",
        },
        operations: operationsWithShare,
      };

      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(output, null, 2) },
        ],
      };
    },
  );
}
