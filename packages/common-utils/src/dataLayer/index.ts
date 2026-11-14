import { sqlppToDisplay } from '@/couchbase/debug';
import {
  CouchbaseUnsupportedError,
  isAccessDeniedError,
  isMissingColumnError,
} from '@/couchbase/errors';

export { DataClient, getDataClient } from './browser';
export type { DataClientLike, DataClientOptions } from './clientLike';
export { getMetadata, type Metadata } from './metadata';
export { NodeDataClient } from './node';

export type Query = {
  sql: string;
  params: Record<string, unknown>;
};

export function formatQueryForDisplay(q: Query): string {
  return sqlppToDisplay(q);
}

export { CouchbaseUnsupportedError, isAccessDeniedError, isMissingColumnError };

export type { ChartConfigWithOptDateRangeEx } from '@/core/chartConfig';
export { renderChartConfig } from '@/core/renderChartConfig';

/** @deprecated All slices run on Couchbase. */
export const COUCHBASE_SLICES = {
  search: true,
  charts: true,
  traces: true,
  metrics: true,
  sessions: true,
  presets: true,
  alerts: true,
  external_api: true,
  mcp: true,
  ai: true,
  cli: true,
} as const;

export type Slice = keyof typeof COUCHBASE_SLICES;

export function isCouchbaseSliceEnabled(_slice: Slice): boolean {
  return true;
}

export async function assertSliceForConnection(
  _slice: Slice,
  _connectionId?: string,
): Promise<void> {}

export async function filterSourcesForSlice<
  T extends { connection: string; disabled?: boolean },
>(sources: T[], _slice?: Slice): Promise<T[]> {
  return sources.filter(s => s.disabled !== true);
}

export type QueryLanguage = 'sqlpp';

export async function queryLanguageForConnection(
  _connectionId: string,
): Promise<QueryLanguage> {
  return 'sqlpp';
}

export async function resolveConnectionKind(
  _connectionId?: string,
): Promise<'couchbase' | 'clickhouse'> {
  return 'couchbase';
}

export function clearConnectionKindCache(): void {}

export function setConnectionKindResolver(
  _resolver?: (id: string) => Promise<'couchbase' | 'clickhouse' | undefined>,
): void {}

export function primeConnectionKind(
  _id: string,
  _kind: 'couchbase' | 'clickhouse',
): void {}

export function resetConnectionKindState(): void {
  clearConnectionKindCache();
}

export {
  runChartQuery as couchbaseChartQuery,
  runChartValidity as couchbaseChartValidity,
} from './chartQuery';

export async function queryViaCouchbase<F extends 'JSON'>(
  client: import('./clientLike').DataClientLike,
  inputs: import('@/query/types').QueryInputs<F>,
): Promise<import('@/couchbase/types').CouchbaseResultSet<F>> {
  return client.query(inputs);
}
