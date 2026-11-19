import {
  type Metadata,
  quoteIdentifierIfNeeded,
} from '@couchbase-traces/common-utils/dist/core/metadata';
import {
  getMetadata,
  type QueryLanguage,
  queryLanguageForConnection,
} from '@couchbase-traces/common-utils/dist/dataLayer';
import { SourceKind } from '@couchbase-traces/common-utils/dist/types';
import PQueue from '@esm2cjs/p-queue';
import { z } from 'zod';

import {
  getConnectionById,
  getConnectionsByTeam,
} from '@/controllers/connection';
import { getSources } from '@/controllers/sources';
import { READ_ONLY_TOOL } from '@/mcp/tools/annotations';
import type { ToolRegistrar } from '@/mcp/tools/types';
import {
  isHiddenSource,
  PROMQL_SOURCE_USAGE,
} from '@/mcp/utils/legacySourceKinds';
import { assertMcpSliceForConnection } from '@/mcp/utils/mcpSlice';
import { runWithTimeout } from '@/mcp/utils/timeout';
import { DataClient } from '@/query';
import logger from '@/utils/logger';

import { QUERYABLE_METRIC_KINDS, sanitizeMetricTables } from './metricKinds';
import { sampleMetricNamesWithLookback } from './metricNames';

// Wall-clock budget for the best-effort metric-name preview sampling.
// list_sources is usually the agent's first call — it must stay snappy,
// so sampling that doesn't finish in time is simply omitted.
const METRIC_PREVIEW_TIMEOUT_MS = 3_000;

// Max metric names shown per kind in the lightweight catalog preview.
// clickstack_describe_source / clickstack_list_metrics list more.
const MAX_PREVIEW_NAMES_PER_KIND = 10;

// Max concurrent legacy store sampling queries during preview collection.
const PREVIEW_CONCURRENCY = 6;

// Server-side cap per preview query, slightly under the wall-clock budget
// so break-mode partial results make it back and get attached before it
// aborts.
const PREVIEW_QUERY_MAX_EXECUTION_SEC = 2.5;

/**
 * DataClient that caps every query with max_execution_time +
 * timeout_overflow_mode=break, so a slow sampling query returns whatever
 * rows legacy store processed within the budget instead of timing out with
 * nothing. The timeout in attachMetricNamePreviews remains the
 * wall-clock backstop for stalls the server-side cap cannot cover (e.g.
 * network).
 */
class PreviewDataClient extends DataClient {}

/**
 * Best-effort: attach a `metricNamesPreview` (kind → recently-reported
 * metric names) to each metric-source summary so the agent can query
 * metrics directly from the catalog — without spending discovery calls
 * on describe_source / list_metrics just to learn what exists.
 *
 * Sampling runs under a hard wall-clock budget; whatever finished in
 * time is attached, the rest is silently omitted (the summary still
 * carries metricTables + the discovery nextSteps).
 */
async function attachMetricNamePreviews({
  teamId,
  entries,
}: {
  teamId: string;
  entries: Array<{
    summary: Record<string, unknown>;
    databaseName: string;
    connectionId: string;
    timestampValueExpression: string;
    metricTables: Record<string, string>;
  }>;
}): Promise<void> {
  if (entries.length === 0) return;

  // Resolve credentials once per distinct connection.
  const connectionIds = [...new Set(entries.map(e => e.connectionId))];
  const clients = new Map<
    string,
    {
      dataClient: DataClient;
      metadata: Metadata;
    }
  >();
  await Promise.all(
    connectionIds.map(async connectionId => {
      const sliceErr = await assertMcpSliceForConnection(connectionId);
      if (sliceErr) return;
      const connection = await getConnectionById(teamId, connectionId, true);
      if (!connection) return;
      const dataClient = new PreviewDataClient({
        requestTimeout: PREVIEW_QUERY_MAX_EXECUTION_SEC * 1000,
      });
      clients.set(connectionId, {
        dataClient,
        metadata: getMetadata(dataClient),
      });
    }),
  );

  const now = new Date();
  // Multiple sources can point at the same physical table (e.g. cloned
  // source configs) — dedupe the sampling per (connection, db, table,
  // timestamp expression); the sampling query depends on all four.
  const tableSampleCache = new Map<string, Promise<string[]>>();
  const previews = new Map<Record<string, unknown>, Map<string, string[]>>();

  // Only sample kinds the query renderer supports: metricsUsage tells
  // the agent everything in the preview is queryable via
  // clickstack_timeseries / clickstack_table, and summary metrics are not.
  const queryableKinds = new Set<string>(QUERYABLE_METRIC_KINDS);

  const tasks: Array<(signal: AbortSignal) => Promise<void>> = [];
  for (const entry of entries) {
    const client = clients.get(entry.connectionId);
    if (!client) continue;
    for (const [kind, tableName] of Object.entries(entry.metricTables)) {
      if (!queryableKinds.has(kind)) continue;
      tasks.push(async signal => {
        // JSON-encode the tuple so delimiter characters inside a
        // component cannot make two distinct tuples collide.
        const cacheKey = JSON.stringify([
          entry.connectionId,
          entry.databaseName,
          tableName,
          entry.timestampValueExpression,
        ]);
        let namesPromise = tableSampleCache.get(cacheKey);
        if (!namesPromise) {
          namesPromise = sampleMetricNamesWithLookback({
            metadata: client.metadata,
            dataClient: client.dataClient,
            databaseName: entry.databaseName,
            tableName,
            connectionId: entry.connectionId,
            now,
            timestampValueExpression: entry.timestampValueExpression,
            signal,
            maxNames: MAX_PREVIEW_NAMES_PER_KIND,
            enrich: false,
          }).then(samples => samples.map(s => s.name));
          tableSampleCache.set(cacheKey, namesPromise);
        }
        const names = await namesPromise;
        if (names.length === 0) return;
        let preview = previews.get(entry.summary);
        if (!preview) {
          preview = new Map();
          previews.set(entry.summary, preview);
        }
        preview.set(kind, names);
      });
    }
  }

  const queue = new PQueue({ concurrency: PREVIEW_CONCURRENCY });
  // Stops waiting at the budget even if a legacy store call ignores the
  // signal, so it cannot hold list_sources past it.
  await runWithTimeout(
    signal =>
      Promise.all(
        tasks.map(task =>
          queue.add(async () => {
            // Don't start new sampling once the budget has expired.
            if (signal.aborted) return;
            try {
              await task(signal);
            } catch {
              // Best-effort: individual sampling failures never fail the call.
            }
          }),
        ),
      ),
    { timeoutMs: METRIC_PREVIEW_TIMEOUT_MS },
  );

  for (const [summary, preview] of previews) {
    if (preview.size > 0) {
      summary.metricNamesPreview = Object.fromEntries(preview);
    }
  }
}

export function registerListSources({
  context,
  registerTool,
}: ToolRegistrar): void {
  const { teamId } = context;

  registerTool(
    'cbt_list_sources',
    {
      title: 'List Sources & Connections',
      annotations: READ_ONLY_TOOL,
      description:
        'List all data sources (logs, metrics, traces) and database connections available to this team. ' +
        'Returns source IDs, names, kinds, and connection IDs as a lightweight catalog. ' +
        'Metric sources additionally include metricNamesPreview — a sample of recently-reported ' +
        'metric names per kind — so metrics can be queried immediately.\n\n' +
        'NEXT STEP: After identifying the source(s) you need, call cbt_describe_source with the ' +
        'sourceId to get the full column schema, attribute keys, and sampled values. ' +
        'This two-step approach avoids fetching expensive schema details for sources you do not need.\n\n' +
        'NOTE: For most queries, use source IDs with cbt_timeseries, cbt_table, ' +
        'cbt_search, or cbt_event_patterns. ' +
        'Connection IDs are only needed for cbt_sql (raw SQL — dialect is queryLanguage on each source/connection).\n\n' +
        'Metric sources may list a "summary" table in metricTables. Summary metrics are ' +
        'not supported by the builder tools — use cbt_sql to look at them.',
      inputSchema: z.object({}),
    },
    async () => {
      const [sources, connections] = await Promise.all([
        getSources(teamId.toString()),
        getConnectionsByTeam(teamId.toString()),
      ]);

      const metricPreviewEntries: Array<{
        summary: Record<string, unknown>;
        databaseName: string;
        connectionId: string;
        timestampValueExpression: string;
        metricTables: Record<string, string>;
      }> = [];

      const prometheusEndpointIds = new Set(
        connections
          .filter(c => c.isPrometheusEndpoint)
          .map(c => c._id.toString()),
      );

      const visibleSources = sources.filter(s => !isHiddenSource(context, s));
      const sourceSummaries = visibleSources.map(s => {
        const meta: Record<string, unknown> = {
          id: s._id.toString(),
          name: s.name,
          kind: s.kind,
          connectionId: s.connection.toString(),
          timestampColumn: s.timestampValueExpression,
        };

        // For clickstack_sql's FROM, so each part is quoted when it needs to
        // be. An unqualified name only resolves in the connection's default
        // database. Metric sources query the tables in metricTables, even
        // when from.tableName is set, so they get the database instead.
        // A PromQL source on a Prometheus endpoint has no source table:
        // its database and table are placeholders, so it gets neither.
        const onPrometheusEndpoint =
          s.kind === SourceKind.Promql &&
          prometheusEndpointIds.has(s.connection.toString());
        if (s.kind === SourceKind.Promql) {
          meta.backend = onPrometheusEndpoint ? 'prometheus' : 'clickhouse';
        }
        if (!onPrometheusEndpoint) {
          if (s.kind !== SourceKind.Metric && s.from.tableName) {
            meta.table = `${quoteIdentifierIfNeeded(s.from.databaseName)}.${quoteIdentifierIfNeeded(s.from.tableName)}`;
          } else {
            meta.database = quoteIdentifierIfNeeded(s.from.databaseName);
          }
        }

        if (s.section) {
          meta.section = s.section;
        }

        if ('eventAttributesExpression' in s && s.eventAttributesExpression) {
          meta.eventAttributesColumn = s.eventAttributesExpression;
        }
        if (
          'resourceAttributesExpression' in s &&
          s.resourceAttributesExpression
        ) {
          meta.resourceAttributesColumn = s.resourceAttributesExpression;
        }

        if (s.kind === SourceKind.Trace) {
          meta.keyColumns = {
            spanName: s.spanNameExpression,
            duration: s.durationExpression,
            durationPrecision: s.durationPrecision,
            statusCode: s.statusCodeExpression,
            serviceName: s.serviceNameExpression,
            traceId: s.traceIdExpression,
            spanId: s.spanIdExpression,
          };
        } else if (s.kind === SourceKind.Log) {
          meta.keyColumns = {
            body: s.bodyExpression,
            serviceName: s.serviceNameExpression,
            severityText: s.severityTextExpression,
            severityNumber: s.severityNumberExpression,
            eventName: s.eventNameExpression,
            traceId: s.traceIdExpression,
          };
        } else if (s.kind === SourceKind.Metric) {
          // Filter out implementation-detail keys (e.g. a stray `_id` on
          // the metricTables object) so the agent only sees valid metric
          // kinds.
          const tables = sanitizeMetricTables(
            s.metricTables as Record<string, unknown> | undefined,
          );
          if (tables) {
            meta.metricTables = tables;
            metricPreviewEntries.push({
              summary: meta,
              databaseName: s.from.databaseName,
              connectionId: s.connection.toString(),
              timestampValueExpression: s.timestampValueExpression,
              metricTables: tables,
            });
          }
        }

        return meta;
      });

      // Best-effort: never let preview sampling fail or stall the catalog.
      try {
        await attachMetricNamePreviews({
          teamId: teamId.toString(),
          entries: metricPreviewEntries,
        });
      } catch (e) {
        logger.warn(
          { teamId, error: e },
          'Failed to attach metric-name previews to list_sources',
        );
      }

      const langByConnection = new Map<string, Promise<QueryLanguage>>();
      const languageFor = (connectionId: string) => {
        let pending = langByConnection.get(connectionId);
        if (!pending) {
          pending = queryLanguageForConnection(connectionId);
          langByConnection.set(connectionId, pending);
        }
        return pending;
      };
      await Promise.all(
        sourceSummaries.map(async summary => {
          summary.queryLanguage = await languageFor(
            summary.connectionId as string,
          );
        }),
      );

      const output = {
        sources: sourceSummaries,
        connections: await Promise.all(
          connections.map(async c => ({
            id: c._id.toString(),
            name: c.name,
            queryLanguage: await languageFor(c._id.toString()),
          })),
        ),
        ...(metricPreviewEntries.length > 0
          ? {
              metricsUsage:
                'Metric sources are queried with the same cbt_timeseries / cbt_table ' +
                'tools — set metricType + metricName on each select item (no describe call needed ' +
                `first). metricNamesPreview shows up to ${MAX_PREVIEW_NAMES_PER_KIND} recently-reported ` +
                'metric names per kind; cbt_describe_source or cbt_list_metrics list the ' +
                'full catalog. During investigations, metrics corroborate incident onset timing, ' +
                'quantify impact (request/error counters), and rule resource saturation in or out ' +
                '(cpu/memory gauges).',
            }
          : {}),
        ...(visibleSources.some(s => s.kind === SourceKind.Promql)
          ? { promqlUsage: PROMQL_SOURCE_USAGE }
          : {}),
        nextStep:
          'Call cbt_describe_source with a sourceId above to get the full column schema, ' +
          'attribute keys, and sampled low-cardinality values before writing queries. ' +
          'connectionId is only needed for cbt_sql.',
      };
      return {
        content: [
          { type: 'text' as const, text: JSON.stringify(output, null, 2) },
        ],
      };
    },
  );
}
