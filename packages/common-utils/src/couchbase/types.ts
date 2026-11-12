import type { ResponseJSON } from '@/clickhouse';
import type { QueryAttribution } from '@/clickhouse/attribution';

import type { SerializedQueryError } from './errors';

export type { ResponseJSON, SerializedQueryError };

export const COUCHBASE_FORMATS = [
  'JSON',
  'JSONEachRow',
  'TabSeparatedRaw',
  'CSV',
  'JSONCompactEachRowWithNamesAndTypes',
] as const;

export type CouchbaseFormat = (typeof COUCHBASE_FORMATS)[number];

export type ScanConsistency = 'not_bounded' | 'request_plus';

export interface CouchbaseQueryInputs<F extends CouchbaseFormat = 'JSON'> {
  /** SQL++ statement */
  query: string;
  /** Named parameters, keys without "$" */
  query_params?: Record<string, unknown>;
  /** Default 'JSON' */
  format?: F;
  abort_signal?: AbortSignal;
  /** Required in the browser client */
  connectionId?: string;
  /** Becomes clientContextId */
  queryId?: string;
  attribution?: QueryAttribution;
  /** Accepted for signature compatibility; only max_execution_time is honored */
  clickhouse_settings?: Record<string, unknown>;
  /** Column order hint */
  columns?: string[];
  /** ClickHouse type name overrides */
  columnTypes?: Record<string, string>;
  timeoutMs?: number;
  scanConsistency?: ScanConsistency;
  queryContext?: { bucket: string; scope: string };
  sourceSettings?: { setting: string; value: string }[];
}

export type ColumnMeta = { name: string; type: string };

export type Statistics = {
  elapsed: number;
  rows_read: number;
  bytes_read: number;
};

export type Frame =
  | { type: 'meta'; meta: ColumnMeta[] }
  | { type: 'rows'; rows: Record<string, unknown>[] }
  | { type: 'end'; rows: number; statistics: Statistics }
  | { type: 'error'; error: SerializedQueryError };

export type Row = { text: string; json<T = unknown>(): T };

export interface CouchbaseResultSet<F extends CouchbaseFormat> {
  readonly query_id: string;
  json<T = unknown>(): Promise<F extends 'JSON' ? ResponseJSON<T> : T[]>;
  text(): Promise<string>;
  stream(): ReadableStream<Row[]>;
  close(): void;
}

export interface DataClient {
  query<F extends CouchbaseFormat>(
    inputs: CouchbaseQueryInputs<F>,
  ): Promise<CouchbaseResultSet<F>>;
  close(): Promise<void>;
  readonly requestTimeoutMs: number;
}

/** Request body of POST /api/couchbase/query. */
export type CouchbaseQueryRequestBody = {
  connectionId: string;
  statement: string;
  parameters?: Record<string, unknown>;
  format?: CouchbaseFormat;
  columns?: string[];
  columnTypes?: Record<string, string>;
  timeoutMs?: number;
  scanConsistency?: ScanConsistency;
  queryContext?: { bucket: string; scope: string };
  sourceSettings?: { setting: string; value: string }[];
  queryId?: string;
  attribution?: QueryAttribution;
};

/** Pino-compatible subset; keeps common-utils free of a logger dependency. */
export type CouchbaseLogger = {
  debug: (...args: any[]) => void;
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
};

export type Keyspace = { bucket: string; scope: string; collection: string };
