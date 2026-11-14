import type { ResponseJSON } from '@clickhouse/client-common';

import type { QueryAttribution } from './attribution';

export type { ResponseJSON };

export type ColumnMeta = {
  codec_expression: string;
  comment: string;
  default_expression: string;
  default_type: string;
  name: string;
  ttl_expression: string;
  type: string;
};

export type ScanConsistency = 'not_bounded' | 'request_plus';

export interface QueryInputs<Format extends string = 'JSON'> {
  query: string;
  format?: Format;
  abort_signal?: AbortSignal;
  query_params?: Record<string, unknown>;
  connectionId?: string;
  queryId?: string;
  attribution?: QueryAttribution;
  scanConsistency?: ScanConsistency;
}
