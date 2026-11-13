import { SourceKind } from '@couchbase-traces/common-utils/dist/types';

import type { McpContext } from '@/mcp/tools/types';

export function isPromqlEnabled(context: McpContext): boolean {
  // A request cannot turn PromQL back on. The context field is ignored.
  void context.promqlEnabled;
  return false;
}

/** Whether MCP hides `source` from the agent: PromQL sources while PromQL is off. */
export function isHiddenSource(
  context: McpContext,
  source: { kind: SourceKind },
): boolean {
  return source.kind === SourceKind.Promql && !isPromqlEnabled(context);
}

export const PROMQL_QUERY_USAGE =
  'PromQL sources hold Prometheus metrics. Query them with cbt_promql; ' +
  'the builder query tools (cbt_timeseries, cbt_table, ' +
  'cbt_search) do not read them.';

export function timeSeriesSqlUsage(table: string): string {
  return (
    `cbt_sql can read ${table} through the timeSeriesTags(${table}) ` +
    `(id, metric_name, tags) and timeSeriesData(${table}) (id, timestamp, ` +
    'value) table functions, joined on id.'
  );
}

export const PROMQL_SOURCE_USAGE =
  `${PROMQL_QUERY_USAGE} Call cbt_describe_source to list label names ` +
  'and metric names. A PromQL source with backend "clickhouse" is a ' +
  `ClickHouse TimeSeries table; to inspect its raw tags and samples, ${timeSeriesSqlUsage('<table>')}`;
