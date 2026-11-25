import type { Metadata } from '@couchbase-traces/common-utils/dist/core/metadata';
import { errorStatusPredicateSql } from '@couchbase-traces/common-utils/dist/core/spanPredicates';
import { sortedArrayQuantile } from '@couchbase-traces/common-utils/dist/couchbase/fn/quantile';
import { crc32 } from '@couchbase-traces/common-utils/dist/couchbase/fn/scalar';
import { disjointSqlParams } from '@couchbase-traces/common-utils/dist/couchbase/sqlpp';
import { renderChartConfig } from '@couchbase-traces/common-utils/dist/dataLayer';
import type { TTraceSource } from '@couchbase-traces/common-utils/dist/types';

// Named parameters for the percentile levels; disjointSqlParams renames the
// CTE parameters, so these names cannot collide with them.
const LATENCY_LEVEL_PARAMS = {
  p50: 'serviceMapP50',
  p95: 'serviceMapP95',
  p99: 'serviceMapP99',
} as const;
const LATENCY_LEVELS: Record<string, number> = {
  [LATENCY_LEVEL_PARAMS.p50]: 0.5,
  [LATENCY_LEVEL_PARAMS.p95]: 0.95,
  [LATENCY_LEVEL_PARAMS.p99]: 0.99,
};

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
  // SQL++ 8.0 has no percentile aggregate (MEDIAN only), so each group keeps
  // its sorted numeric durations. ARRAY_AGG keeps NULLs and ARRAY_SORT puts
  // them first, so non-numeric durations are dropped before sorting.
  const latencyAgg = hasDuration
    ? `, ARRAY_SORT(ARRAY v FOR v IN ARRAY_AGG(CASE WHEN ISNUMBER(s.duration) THEN s.duration END) WHEN ISNUMBER(v) END) AS durs`
    : '';
  // Upstream's quantiles(0.5, 0.95, 0.99) interpolates linearly between the
  // neighbouring samples; sortedArrayQuantile does the same.
  const percentiles = (arr: string) =>
    hasDuration
      ? (['p50', 'p95', 'p99'] as const)
          .map(
            p =>
              `, ${sortedArrayQuantile(arr, `$${LATENCY_LEVEL_PARAMS[p]}`)} AS ${p}`,
          )
          .join('\n  ')
      : '';
  // The node row covers the same joined spans as upstream's (serverServiceName)
  // grouping set, which is exactly the union of that service's edge groups.
  const nodeDurs = hasDuration
    ? `, ARRAY_SORT(ARRAY v FOR v IN ARRAY_FLATTEN(ARRAY_AGG(edge.durs), 1) WHEN ISNUMBER(v) END) AS durs`
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
       -- An unmatched LEFT JOIN leaves c.serviceName MISSING, which IS NULL
       -- rejects; ClickHouse fills '' and keeps the span, so match that.
       WHERE (c.serviceName IS NOT VALUED OR s.serviceName != c.serviceName)
         ${serviceNameFilter}
       GROUP BY s.serviceName, c.serviceName
     )
SELECT
  edge.serverServiceName AS serverServiceName,
  edge.clientServiceName AS clientServiceName,
  0 AS isNodeLevel,
  edge.requestCount AS requestCount,
  edge.errorCount AS errorCount
  ${percentiles('edge.durs')}
FROM edges AS edge
UNION ALL
SELECT
  node.serverServiceName AS serverServiceName,
  NULL AS clientServiceName,
  1 AS isNodeLevel,
  node.requestCount AS requestCount,
  node.errorCount AS errorCount
  ${percentiles('node.durs')}
FROM (
  SELECT
    edge.serverServiceName AS serverServiceName,
    SUM(edge.requestCount) AS requestCount,
    SUM(edge.errorCount) AS errorCount
    ${nodeDurs}
  FROM edges AS edge
  GROUP BY edge.serverServiceName
) AS node
ORDER BY serverServiceName, isNodeLevel, clientServiceName
`.trim();

  return {
    sql,
    params: {
      ...mergeParams(serverCTE, clientCTE),
      ...(hasDuration ? LATENCY_LEVELS : {}),
    },
    dialect: 'sqlpp',
  };
}
