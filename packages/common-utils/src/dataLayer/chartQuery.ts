import type { BaseClickhouseClient, QueryInputs } from '@/clickhouse';
import { renderChartConfigCouchbase } from '@/couchbase/render';
import { couchbasePostprocessHints } from '@/couchbase/render/postprocess';
import { isBuilderChartConfig } from '@/guards';

import { resolveConnectionKind } from './kind';

type ChartArgs = Parameters<BaseClickhouseClient['queryChartConfig']>[0];

type ChartJson = Awaited<ReturnType<BaseClickhouseClient['queryChartConfig']>>;

type QueryFn = BaseClickhouseClient['query'];

export async function couchbaseChartQuery(
  query: QueryFn,
  args: ChartArgs,
): Promise<ChartJson | 'clickhouse'> {
  const kind = await resolveConnectionKind(args.config.connection);
  if (kind !== 'couchbase') return 'clickhouse';
  const rendered = await renderChartConfigCouchbase(
    args.config,
    args.metadata,
    args.querySettings,
  );
  const hints = isBuilderChartConfig(args.config)
    ? couchbasePostprocessHints(args.config)
    : {};
  const resp = await query({
    query: rendered.sql,
    query_params: rendered.params,
    format: 'JSON',
    abort_signal: args.opts?.abort_signal,
    connectionId: args.config.connection,
    clickhouse_settings: args.opts?.clickhouse_settings,
    scanConsistency: args.opts?.scanConsistency,
    attribution: { source: args.config.source },
    ...hints,
  } as QueryInputs<'JSON'>);
  return resp.json() as Promise<ChartJson>;
}

export async function couchbaseChartValidity(
  query: QueryFn,
  args: ChartArgs,
): Promise<{ isValid: boolean; error?: string } | 'clickhouse'> {
  const kind = await resolveConnectionKind(args.config.connection);
  if (kind !== 'couchbase') return 'clickhouse';
  try {
    const rendered = await renderChartConfigCouchbase(
      args.config,
      args.metadata,
      args.querySettings,
    );
    await query({
      query: `EXPLAIN ${rendered.sql}`,
      query_params: rendered.params,
      format: 'JSON',
      abort_signal: args.opts?.abort_signal,
      connectionId: args.config.connection,
      clickhouse_settings: args.opts?.clickhouse_settings,
      attribution: { source: args.config.source },
    });
    return { isValid: true };
  } catch (err) {
    return {
      isValid: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
