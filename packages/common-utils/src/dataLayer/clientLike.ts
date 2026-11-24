import type { CouchbaseFormat, CouchbaseResultSet } from '@/couchbase/types';
import type { QueryInputs } from '@/query/types';
import type { ResponseJSON } from '@/query/types';
import type { ChartConfigWithOptDateRange } from '@/types';

import type { Metadata } from './metadata';

export type DataClientOptions = {
  requestTimeout?: number;
  /**
   * Server-side query timeout for queries that set none themselves (no
   * `timeoutMs`, no `max_execution_time`). Ahead of the source and team
   * timeouts, like upstream's per-client `max_execution_time` setting.
   */
  queryTimeoutMs?: number;
  attribution?: import('@/query/attribution').QueryAttribution;
  application?: string;
};

export interface DataClientLike {
  readonly requestTimeoutMs: number;
  query<F extends CouchbaseFormat = 'JSON'>(
    inputs: QueryInputs<F>,
  ): Promise<CouchbaseResultSet<F>>;
  queryChartConfig(args: {
    config: ChartConfigWithOptDateRange;
    metadata: Metadata;
    opts?: {
      abort_signal?: AbortSignal;
      scanConsistency?: 'not_bounded' | 'request_plus';
    };
    querySettings: import('@/types').QuerySettings | undefined;
  }): Promise<ResponseJSON<Record<string, string | number>>>;
  testChartConfigValidity(args: {
    config: ChartConfigWithOptDateRange;
    metadata: Metadata;
    opts?: { abort_signal?: AbortSignal };
    querySettings: import('@/types').QuerySettings | undefined;
  }): Promise<{ isValid: boolean; rowEstimate?: number; error?: string }>;
  close(): Promise<void>;
}
