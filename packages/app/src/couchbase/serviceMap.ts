import type { Metadata } from '@couchbase-traces/common-utils/dist/core/metadata';
import { errorStatusPredicateSql } from '@couchbase-traces/common-utils/dist/core/spanPredicates';
import { crc32 } from '@couchbase-traces/common-utils/dist/couchbase/fn/scalar';
import { disjointSqlParams } from '@couchbase-traces/common-utils/dist/couchbase/sqlpp';
import { renderChartConfig } from '@couchbase-traces/common-utils/dist/dataLayer';
import type { TTraceSource } from '@couchbase-traces/common-utils/dist/types';

function samplingPredicate(
  traceIdExpression: string,
  samplingFactor: number,
): string {
  if (samplingFactor <= 1) return 'TRUE';
  // Upstream samples on cityHash64(TraceId) % N; any uniform hash keeps whole
  // traces together, which is what the map needs.
  return `MOD(${crc32(traceIdExpression)}, ${samplingFactor}) = 0`;
}

function mergeParams(
  ...parts: { params?: Record<string, unknown> }[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const part of parts) {
    Object.assign(out, part.params ?? {});
  }
  return out;
}

/**
 * Service-map query for Couchbase per Phase 7 §9.3.
 * Child→parent equi-join on (traceId, parentSpanId=spanId), matching the
 * legacy store join keys; document KEYS form is equivalent when joining the
 * base collection (`TraceId || ":" || ParentSpanId`). GROUPING SETS becomes
 * UNION ALL of edge and node aggregations.
 */
export async function getServiceMapQueryCouchbase({
  source,
  dateRange,
  traceId,
  metadata,
  samplingFactor,
  where,
  whereLanguage,
  serviceNames,
}: {
  source: TTraceSource;
  dateRange: [Date, Date];
  traceId?: string;
  metadata: Metadata;
  samplingFactor: number;
  where?: string;
  whereLanguage?: 'sql' | 'lucene';
  serviceNames?: string[];
}): Promise<{
  sql: string;
  params: Record<string, unknown>;
  dialect: 'sqlpp';
}> {
  const effectiveSamplingLevel = traceId ? 1 : samplingFactor;

  const baseCTEConfig = {
    from: source.from,
    connection: source.connection,
    dateRange,
    timestampValueExpression: source.timestampValueExpression,
    timestampFormat:
      'timestampFormat' in source ? source.timestampFormat : undefined,
    ...(source.implicitColumnExpression != null
      ? { implicitColumnExpression: source.implicitColumnExpression }
      : {}),
    where: where || '',
    whereLanguage: whereLanguage ?? 'lucene',
    filters: [
      {
        type: 'sql' as const,
        condition: samplingPredicate(
          source.traceIdExpression ?? 'TraceId',
          effectiveSamplingLevel,
        ),
      },
      ...(traceId
        ? [
            {
              type: 'sql' as const,
              condition: `${source.traceIdExpression ?? 'TraceId'} = ${JSON.stringify(traceId)}`,
            },
          ]
        : []),
    ],
    select: [
      {
        valueExpression: source.traceIdExpression ?? 'TraceId',
        alias: 'traceId',
      },
      {
        valueExpression: source.spanIdExpression ?? 'SpanId',
        alias: 'spanId',
      },
      {
        valueExpression: source.serviceNameExpression ?? 'ServiceName',
        alias: 'serviceName',
      },
      {
        valueExpression: source.parentSpanIdExpression ?? 'ParentSpanId',
        alias: 'parentSpanId',
      },
      {
        valueExpression: source.statusCodeExpression ?? 'StatusCode',
        alias: 'statusCode',
      },
      ...(source.durationExpression
        ? [{ valueExpression: source.durationExpression, alias: 'duration' }]
        : []),
    ],
  };

  const [serverCTE, clientCTE] = await Promise.all([
    renderChartConfig(
      {
        ...baseCTEConfig,
        filters: [
          ...baseCTEConfig.filters,
          {
            type: 'sql',
            condition: `${source.spanKindExpression} IN ['Server', 'Consumer', 'SPAN_KIND_SERVER', 'SPAN_KIND_CONSUMER']`,
          },
        ],
      },
      metadata,
      source.querySettings,
    ),
    renderChartConfig(
      {
        ...baseCTEConfig,
        filters: [
          ...baseCTEConfig.filters,
          {
            type: 'sql',
            condition: `${source.spanKindExpression} IN ['Client', 'Producer', 'SPAN_KIND_CLIENT', 'SPAN_KIND_PRODUCER']`,
          },
        ],
      },
      metadata,
      source.querySettings,
    ),
  ]).then(disjointSqlParams);

  const serviceNameFilter =
    serviceNames && serviceNames.length > 0
      ? `AND (s.serviceName IN [${serviceNames.map(s => JSON.stringify(s)).join(', ')}] OR c.serviceName IN [${serviceNames.map(s => JSON.stringify(s)).join(', ')}])`
      : '';

  const errorPred = errorStatusPredicateSql('s.statusCode');
  const hasDuration = Boolean(source.durationExpression);
  const latencyAgg = hasDuration
    ? `, ARRAY_SORT(ARRAY_AGG(CASE WHEN ISNUMBER(s.duration) THEN TONUMBER(s.duration) END)) AS durs`
    : '';
  const latencyEdgeSelect = hasDuration
    ? `, CASE WHEN ARRAY_LENGTH(edge.durs) = 0 THEN NULL ELSE edge.durs[FLOOR(0.5 * (ARRAY_LENGTH(edge.durs) - 1))] END AS p50
      , CASE WHEN ARRAY_LENGTH(edge.durs) = 0 THEN NULL ELSE edge.durs[FLOOR(0.95 * (ARRAY_LENGTH(edge.durs) - 1))] END AS p95
      , CASE WHEN ARRAY_LENGTH(edge.durs) = 0 THEN NULL ELSE edge.durs[FLOOR(0.99 * (ARRAY_LENGTH(edge.durs) - 1))] END AS p99`
    : '';
  const latencyNodeSelect = hasDuration
    ? `, NULL AS p50, NULL AS p95, NULL AS p99`
    : '';

  const sql = `
WITH ServerSpans AS (${serverCTE.sql}),
     ClientSpans AS (${clientCTE.sql}),
     edges AS (
       SELECT
         s.serviceName AS serverServiceName,
         c.serviceName AS clientServiceName,
         COUNT(*) * ${effectiveSamplingLevel} AS requestCount,
         COUNT(CASE WHEN ${errorPred} THEN 1 END) * ${effectiveSamplingLevel} AS errorCount
         ${latencyAgg}
       FROM ServerSpans AS s
       LEFT JOIN ClientSpans AS c
         ON s.traceId = c.traceId AND s.parentSpanId = c.spanId
       WHERE (c.serviceName IS NULL OR s.serviceName != c.serviceName)
         ${serviceNameFilter}
       GROUP BY s.serviceName, c.serviceName
     )
SELECT
  edge.serverServiceName AS serverServiceName,
  edge.clientServiceName AS clientServiceName,
  0 AS isNodeLevel,
  edge.requestCount AS requestCount,
  edge.errorCount AS errorCount
  ${latencyEdgeSelect}
FROM edges AS edge
UNION ALL
SELECT
  edge.serverServiceName AS serverServiceName,
  NULL AS clientServiceName,
  1 AS isNodeLevel,
  SUM(edge.requestCount) AS requestCount,
  SUM(edge.errorCount) AS errorCount
  ${latencyNodeSelect}
FROM edges AS edge
GROUP BY edge.serverServiceName
ORDER BY serverServiceName, isNodeLevel, clientServiceName
`.trim();

  return {
    sql,
    params: mergeParams(serverCTE, clientCTE),
    dialect: 'sqlpp',
  };
}
