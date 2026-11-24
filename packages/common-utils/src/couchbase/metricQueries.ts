/**
 * SQL++ for the MCP metric discovery tools (cbt_list_metrics,
 * cbt_describe_metric, and the metric-name sample in cbt_describe_source).
 * Upstream built these with ClickHouse `{x:Identifier}` parameters,
 * `argMax`/`anyLast`, `mapKeys` and `groupUniqArray` (Q26). Values are named
 * parameters, keyspaces go through `keyspace()`, and the time window uses the
 * source's timestamp columns as the trace tools do.
 */
import { keyspace, quoteIdent, type SqlPP, sqlpp } from '@/couchbase/sqlpp';
import { type TimeFormat, tsMillisExpr } from '@/couchbase/time';
import {
  eventTimestampExpr,
  timestampColumnsFilter,
} from '@/couchbase/timestampColumns';

/** One metric kind's collection plus the source's timestamp fields. */
export type MetricKindTable = {
  databaseName: string;
  scopeName?: string;
  tableName: string;
  timestampValueExpression: string;
  timestampFormat?: TimeFormat;
};

type Window = { start: Date; end: Date };

const raw = (s: string) => ({ Raw: s });

function fromKeyspace(t: MetricKindTable) {
  return raw(
    keyspace({
      bucket: t.databaseName,
      scope: t.scopeName || 'default',
      collection: t.tableName,
    }),
  );
}

function inWindow(t: MetricKindTable, w: Window): SqlPP {
  return timestampColumnsFilter(t, w.start, w.end);
}

/** Event time in epoch ms, so the latest row wins whatever the format. */
function eventMillis(t: MetricKindTable): string {
  return tsMillisExpr(
    eventTimestampExpr(t.timestampValueExpression),
    t.timestampFormat ?? 'iso8601',
  );
}

function withNamed(q: SqlPP, named: Record<string, unknown>): SqlPP {
  return {
    statement: q.statement.trim(),
    parameters: { ...q.parameters, ...named },
  };
}

/**
 * One page of distinct metric names in a window, ascending, after `afterName`
 * (exclusive). `namePattern` keeps upstream's ILIKE semantics: `%` and `_` are
 * wildcards and the match ignores case.
 */
export function metricNamesPageQuery(
  args: {
    table: MetricKindTable;
    namePattern?: string;
    afterName?: string;
    limit: number;
  } & Window,
): SqlPP {
  const after =
    args.afterName !== undefined ? raw(' AND MetricName > $after') : raw('');
  const pattern = args.namePattern
    ? raw(' AND LOWER(MetricName) LIKE LOWER($pattern)')
    : raw('');
  return withNamed(
    sqlpp`
SELECT MetricName
FROM ${fromKeyspace(args.table)}
WHERE ${inWindow(args.table, args)}
  AND MetricName IS VALUED${after}${pattern}
GROUP BY MetricName
ORDER BY MetricName ASC
LIMIT $limit`,
    {
      limit: args.limit,
      ...(args.afterName !== undefined && { after: args.afterName }),
      ...(args.namePattern && { pattern: args.namePattern }),
    },
  );
}

/**
 * The most recent unit and description per metric name, as upstream's
 * `argMax(col, TimeUnix)`: `MAX([ts, col])[1]` orders by time first. When
 * `sampleSize` is set, only that many matching documents are read.
 */
export function metricUnitsQuery(
  args: {
    table: MetricKindTable;
    names: string[];
    hasUnit: boolean;
    hasDescription: boolean;
    sampleSize?: number;
  } & Window,
): SqlPP {
  const cols = [
    ...(args.hasUnit ? ['MetricUnit'] : []),
    ...(args.hasDescription ? ['MetricDescription'] : []),
  ];
  const inner = ['MetricName', `${eventMillis(args.table)} AS __ts`, ...cols]
    .map(c => (c.includes(' AS ') ? c : quoteIdent(c)))
    .join(', ');
  const outer = [
    's.`MetricName`',
    ...cols.map(c => `MAX([s.__ts, s.${quoteIdent(c)}])[1] AS ${quoteIdent(c)}`),
  ].join(', ');
  const sample = args.sampleSize != null ? raw(' LIMIT $sample') : raw('');
  return withNamed(
    sqlpp`
SELECT ${raw(outer)}
FROM (
  SELECT ${raw(inner)}
  FROM ${fromKeyspace(args.table)}
  WHERE MetricName IN $names
    AND ${inWindow(args.table, args)}${sample}
) AS s
GROUP BY s.\`MetricName\``,
    {
      names: args.names,
      ...(args.sampleSize != null && { sample: args.sampleSize }),
    },
  );
}

/**
 * Distinct attribute keys of each map column for one metric, aggregated from
 * at most `sampleSize` matching documents (upstream:
 * `arrayDistinct(arrayFlatten(groupArray(mapKeys(col))))`). Always one row;
 * a column with no keys is NULL.
 */
export function metricAttributeKeysQuery(
  args: {
    table: MetricKindTable;
    metricName: string;
    mapColumns: string[];
    sampleSize: number;
  } & Window,
): SqlPP {
  const inner = args.mapColumns.map(quoteIdent).join(', ');
  const outer = args.mapColumns
    .map(c => {
      const col = `s.${quoteIdent(c)}`;
      return `ARRAY_DISTINCT(ARRAY_FLATTEN(ARRAY_AGG(OBJECT_NAMES(${col})), 1)) AS ${quoteIdent(c)}`;
    })
    .join(', ');
  return withNamed(
    sqlpp`
SELECT ${raw(outer)}
FROM (
  SELECT ${raw(inner)}
  FROM ${fromKeyspace(args.table)}
  WHERE MetricName = $metric
    AND ${inWindow(args.table, args)}
  LIMIT $sample
) AS s`,
    { metric: args.metricName, sample: args.sampleSize },
  );
}

/**
 * Distinct values per (map column, key), as upstream's
 * `groupUniqArray(n)(col[key])`; result field `param<i>` matches `keys[i]`.
 * Values are read as strings, as from a ClickHouse `Map(String, String)`.
 * The caller caps each list at its `n` (SQL++ has no bounded ARRAY_AGG).
 */
export function metricAttributeValuesQuery(
  args: {
    table: MetricKindTable;
    metricName: string;
    keys: { mapColumn: string; key: string }[];
    sampleSize: number;
  } & Window,
): SqlPP {
  const mapColumns = [...new Set(args.keys.map(k => k.mapColumn))];
  const inner = mapColumns.map(quoteIdent).join(', ');
  const outer = args.keys
    .map(({ mapColumn, key }, i) => {
      const value = `TOSTRING(s.${quoteIdent(mapColumn)}.${quoteIdent(key)})`;
      return `ARRAY_AGG(DISTINCT ${value}) AS ${quoteIdent(`param${i}`)}`;
    })
    .join(', ');
  return withNamed(
    sqlpp`
SELECT ${raw(outer)}
FROM (
  SELECT ${raw(inner)}
  FROM ${fromKeyspace(args.table)}
  WHERE MetricName = $metric
    AND ${inWindow(args.table, args)}
  LIMIT $sample
) AS s`,
    { metric: args.metricName, sample: args.sampleSize },
  );
}
