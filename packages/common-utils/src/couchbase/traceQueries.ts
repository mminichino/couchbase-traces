/**
 * SQL++ for the MCP trace tools (cbt_trace_waterfall and
 * cbt_trace_top_time_consuming_operations). Upstream built these with
 * ClickHouse `{name:Type}` parameters and functions; here every value is a
 * named parameter (`$tid`, `$limit`, ... plus `$pN` time bounds), every
 * keyspace part goes through `keyspace()`, and source expressions get the D9
 * map-access rewrite. Source expressions are trusted (set by a team admin),
 * as in the chart renderer.
 */
import { quantile } from '@/couchbase/fn/quantile';
import { count, uniq } from '@/couchbase/fn/scalar';
import {
  rewriteMapSubscripts,
  rewriteSqlFragment,
} from '@/couchbase/mapAccess';
import { keyspace, quoteIdent, type SqlPP, sqlpp } from '@/couchbase/sqlpp';
import {
  SQLPP_DATE_FORMAT,
  type TimeFormat,
  tsMillisExpr,
} from '@/couchbase/time';
import {
  eventTimestampExpr,
  timestampColumnsFilter,
} from '@/couchbase/timestampColumns';

export type TraceTable = {
  from: { databaseName: string; scopeName?: string; tableName: string };
  timestampValueExpression: string;
  timestampFormat?: TimeFormat;
};

type Window = { start: Date; end: Date };

const raw = (s: string) => ({ Raw: s });
const as = (alias: string) => raw(`AS ${quoteIdent(alias)}`);

function fromKeyspace(t: TraceTable) {
  return raw(
    keyspace({
      bucket: t.from.databaseName,
      scope: t.from.scopeName ?? 'default',
      collection: t.from.tableName,
    }),
  );
}

/** A source expression as SQL++, or `fallback` when the source has none. */
function expr(e: string | undefined, fallback = "''"): string {
  return e ? rewriteMapSubscripts(e) : fallback;
}

function eventTs(t: TraceTable) {
  return eventTimestampExpr(t.timestampValueExpression);
}

/** Event time as a string, so rows sort and serialize like upstream. */
function eventTsText(t: TraceTable) {
  const ts = eventTs(t);
  return t.timestampFormat === 'epoch_millis'
    ? `MILLIS_TO_UTC(${ts}, ${JSON.stringify(SQLPP_DATE_FORMAT)})`
    : ts;
}

function withNamed(q: SqlPP, named: Record<string, unknown>): SqlPP {
  return {
    statement: q.statement.trim(),
    parameters: { ...q.parameters, ...named },
  };
}

/** Epoch-ms `firstSeen`/`lastSeen` of one trace in a window (NULL when absent). */
export function traceExtentQuery(
  args: {
    table: TraceTable;
    traceIdExpression: string;
    traceId: string;
  } & Window,
): SqlPP {
  const ms = tsMillisExpr(
    eventTs(args.table),
    args.table.timestampFormat ?? 'iso8601',
  );
  return withNamed(
    sqlpp`
SELECT MIN(${raw(ms)}) AS firstSeen, MAX(${raw(ms)}) AS lastSeen
FROM ${fromKeyspace(args.table)}
WHERE ${raw(expr(args.traceIdExpression))} = $tid
  AND ${timestampColumnsFilter(args.table, args.start, args.end)}`,
    { tid: args.traceId },
  );
}

export type SpanExpressions = {
  traceId: string;
  spanId: string;
  parentSpanId: string;
  spanName: string;
  spanKind: string;
  duration: string;
  serviceName?: string;
  statusCode?: string;
  statusMessage?: string;
  attributes?: string;
};

/** Every span of one trace, oldest first, in the waterfall row shape. */
export function spanTreeQuery(
  args: {
    table: TraceTable;
    exprs: SpanExpressions;
    traceId: string;
    divisor: number;
    limit: number;
  } & Window,
): SqlPP {
  const e = args.exprs;
  return withNamed(
    sqlpp`
SELECT ${raw(expr(e.spanId))} ${as('spanId')},
  ${raw(expr(e.parentSpanId))} ${as('parentSpanId')},
  ${raw(expr(e.serviceName))} ${as('serviceName')},
  ${raw(expr(e.spanName))} ${as('spanName')},
  ${raw(expr(e.spanKind))} ${as('spanKind')},
  ${raw(expr(e.duration))} / $divisor ${as('durationMs')},
  ${raw(expr(e.statusCode))} ${as('statusCode')},
  ${raw(expr(e.statusMessage))} ${as('statusMessage')},
  ${raw(eventTsText(args.table))} ${as('timestamp')},
  ${raw(expr(e.attributes, '{}'))} ${as('spanAttributes')}
FROM ${fromKeyspace(args.table)}
WHERE ${raw(expr(e.traceId))} = $tid
  AND ${timestampColumnsFilter(args.table, args.start, args.end)}
ORDER BY ${raw(eventTs(args.table))} ASC
LIMIT $limit`,
    { tid: args.traceId, divisor: args.divisor, limit: args.limit },
  );
}

export type LogExpressions = {
  traceId?: string;
  spanId?: string;
  body?: string;
  severityText?: string;
  serviceName?: string;
};

/** Log rows that share one TraceId, oldest first. */
export function correlatedLogsQuery(
  args: {
    table: TraceTable;
    exprs: LogExpressions;
    traceId: string;
    limit: number;
  } & Window,
): SqlPP {
  const e = args.exprs;
  return withNamed(
    sqlpp`
SELECT ${raw(eventTsText(args.table))} ${as('timestamp')},
  ${raw(expr(e.severityText))} ${as('severityText')},
  ${raw(expr(e.body))} ${as('body')},
  ${raw(expr(e.serviceName))} ${as('serviceName')},
  ${raw(expr(e.spanId))} ${as('spanId')}
FROM ${fromKeyspace(args.table)}
WHERE ${raw(expr(e.traceId, 'TraceId'))} = $tid
  AND ${timestampColumnsFilter(args.table, args.start, args.end)}
ORDER BY ${raw(eventTs(args.table))} ASC
LIMIT $limit`,
    { tid: args.traceId, limit: args.limit },
  );
}

/**
 * Child operations ranked by total time across traces whose parent span
 * matches `parentFilter` (SQL, trusted as a where clause). Parent rows are
 * excluded so the totals measure their children.
 */
export function traceBreakdownQuery(args: {
  table: TraceTable;
  exprs: {
    traceId: string;
    serviceName?: string;
    spanName?: string;
    duration: string;
  };
  parentFilter: string;
  parentStart: Date;
  parentEnd: Date;
  childStart: Date;
  childEnd: Date;
  /** Parent duration floor, already in stored units. */
  minParentDurationStored?: number;
  divisor: number;
  maxParentTraces: number;
  topN: number;
}): SqlPP {
  const t = args.table;
  const traceId = expr(args.exprs.traceId);
  const service = expr(args.exprs.serviceName);
  const operation = expr(args.exprs.spanName);
  const duration = expr(args.exprs.duration);
  const filter = rewriteSqlFragment(args.parentFilter);
  const minDuration = args.minParentDurationStored != null;
  return withNamed(
    sqlpp`
WITH parent_traces AS (
  SELECT DISTINCT RAW ${raw(traceId)}
  FROM ${fromKeyspace(t)}
  WHERE ${timestampColumnsFilter(t, args.parentStart, args.parentEnd)}
    AND (${raw(filter)})${raw(minDuration ? `\n    AND ${duration} >= $minParentDuration` : '')}
  LIMIT $maxParentTraces
)
SELECT ${raw(service)} ${as('service')},
  ${raw(operation)} ${as('operation')},
  SUM(${raw(duration)}) / $divisor ${as('total_time_ms')},
  ${raw(count())} ${as('calls')},
  ${raw(uniq(traceId))} ${as('in_parents')},
  ${quantile(0.5, duration)} / $divisor ${as('p50_ms')},
  ${quantile(0.99, duration)} / $divisor ${as('p99_ms')}
FROM ${fromKeyspace(t)}
WHERE ${raw(traceId)} IN parent_traces
  AND ${timestampColumnsFilter(t, args.childStart, args.childEnd)}
  AND NOT (${raw(filter)})
GROUP BY ${raw(service)}, ${raw(operation)}
ORDER BY ${raw(quoteIdent('total_time_ms'))} DESC
LIMIT $topN`,
    {
      divisor: args.divisor,
      maxParentTraces: args.maxParentTraces,
      topN: args.topN,
      ...(minDuration
        ? { minParentDuration: args.minParentDurationStored }
        : {}),
    },
  );
}
