import type { QueryAttribution } from './attribution';

/** JSON query result envelope (legacy store `JSON` format compatibility). */
export type ResponseJSON<T = unknown> = {
  data: T[];
  query_id?: string;
  totals?: T;
  extremes?: Record<string, unknown>;
  meta?: Array<{
    name: string;
    type: string;
  }>;
  statistics?: {
    elapsed: number;
    rows_read: number;
    bytes_read: number;
  };
  rows?: number;
  rows_before_limit_at_least?: number;
};

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
