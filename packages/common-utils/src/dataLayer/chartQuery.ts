import { setChartSelectsAlias } from '@/core/chartConfig';
import { renderChartConfig } from '@/core/renderChartConfig';
import { couchbasePostprocessHints } from '@/couchbase/render/postprocess';
import { isBuilderChartConfig } from '@/guards';
import { QueryError } from '@/query/errors';
import type { ResponseJSON } from '@/query/types';
import type { ChartConfigWithOptDateRange, QuerySettings } from '@/types';

import type { DataClientLike } from './clientLike';
import type { Metadata } from './metadata';

type ChartJson = ResponseJSON<Record<string, string | number>>;

export async function runChartQuery(
  client: DataClientLike,
  args: {
    config: ChartConfigWithOptDateRange;
    metadata: Metadata;
    opts?: {
      abort_signal?: AbortSignal;
      scanConsistency?: 'not_bounded' | 'request_plus';
    };
    querySettings: QuerySettings | undefined;
  },
): Promise<ChartJson> {
  let config = args.config;
  config = isBuilderChartConfig(config) ? setChartSelectsAlias(config) : config;
  const rendered = await renderChartConfig(
    config,
    args.metadata,
    args.querySettings,
  );
  const hints = isBuilderChartConfig(config)
    ? couchbasePostprocessHints(config)
    : {};
  const resp = await client.query({
    query: rendered.sql,
    query_params: rendered.params,
    format: 'JSON',
    abort_signal: args.opts?.abort_signal,
    connectionId: config.connection,
    scanConsistency: args.opts?.scanConsistency,
    attribution: { source: config.source },
    ...hints,
  });
  return resp.json() as Promise<ChartJson>;
}

export async function runChartValidity(
  client: DataClientLike,
  args: {
    config: ChartConfigWithOptDateRange;
    metadata: Metadata;
    opts?: { abort_signal?: AbortSignal };
    querySettings: QuerySettings | undefined;
  },
): Promise<{ isValid: boolean; rowEstimate?: number; error?: string }> {
  try {
    const rendered = await renderChartConfig(
      args.config,
      args.metadata,
      args.querySettings,
    );
    await client.query({
      query: `EXPLAIN ${rendered.sql}`,
      query_params: rendered.params,
      format: 'JSON',
      abort_signal: args.opts?.abort_signal,
      connectionId: args.config.connection,
      attribution: { source: args.config.source },
    });
    return { isValid: true };
  } catch (error: unknown) {
    return {
      isValid: false,
      error:
        error instanceof QueryError
          ? error.message
          : 'Error while validating chart config',
    };
  }
}
