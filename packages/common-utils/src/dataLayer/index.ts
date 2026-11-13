import {
  isAccessDeniedError as chAccessDenied,
  isMissingColumnError as chMissingColumn,
  parameterizedQueryToSql,
} from '@/clickhouse';
import {
  type ChartConfigWithOptDateRangeEx,
  renderChartConfig as renderClickhouseChart,
} from '@/core/renderChartConfig';
import { sqlppToDisplay } from '@/couchbase/debug';
import {
  isAccessDeniedError as cbAccessDenied,
  isMissingColumnError as cbMissingColumn,
} from '@/couchbase/errors';
import {
  renderChartConfigCouchbase,
  type SqlppQuery,
} from '@/couchbase/render';
import type { QuerySettings } from '@/types';

import { CouchbaseNotReadyError } from './errors';
import { resolveConnectionKind } from './kind';

export { CouchbaseNotReadyError, CouchbaseUnsupportedError } from './errors';
export {
  clearConnectionKindCache,
  type ConnectionKind,
  type ConnectionKindResolver,
  primeConnectionKind,
  resolveConnectionKind,
  setConnectionKindResolver,
} from './kind';
export {
  getRoutingMetadata as getMetadata,
  RoutingMetadata,
} from './routingMetadata';
export type { SqlppQuery } from '@/couchbase/render';

export type Slice =
  | 'search'
  | 'charts'
  | 'traces'
  | 'metrics'
  | 'sessions'
  | 'presets'
  | 'alerts'
  | 'external_api'
  | 'mcp'
  | 'ai'
  | 'cli';

export type QueryLanguage = 'clickhouse' | 'sqlpp';

/** Phase 8 turns remaining slices on one at a time after Phase 7. */
export const COUCHBASE_SLICES: Readonly<Record<Slice, boolean>> = {
  search: true,
  charts: true,
  traces: true,
  metrics: true,
  sessions: true,
  presets: true,
  alerts: true,
  external_api: true,
  mcp: false,
  ai: false,
  cli: false,
};

export function isCouchbaseSliceEnabled(slice: Slice): boolean {
  switch (slice) {
    case 'search':
      return COUCHBASE_SLICES.search;
    case 'charts':
      return COUCHBASE_SLICES.charts;
    case 'traces':
      return COUCHBASE_SLICES.traces;
    case 'metrics':
      return COUCHBASE_SLICES.metrics;
    case 'sessions':
      return COUCHBASE_SLICES.sessions;
    case 'presets':
      return COUCHBASE_SLICES.presets;
    case 'alerts':
      return COUCHBASE_SLICES.alerts;
    case 'external_api':
      return COUCHBASE_SLICES.external_api;
    case 'mcp':
      return COUCHBASE_SLICES.mcp;
    case 'ai':
      return COUCHBASE_SLICES.ai;
    case 'cli':
      return COUCHBASE_SLICES.cli;
  }
}

/** Drops Couchbase sources while their slice is still off. Phase 7 calls this. */
export async function filterSourcesForSlice<T extends { connection: string }>(
  sources: T[],
  slice: Slice,
): Promise<T[]> {
  if (isCouchbaseSliceEnabled(slice)) return sources;
  const kept: T[] = [];
  for (const source of sources) {
    const kind = await resolveConnectionKind(source.connection);
    if (kind !== 'couchbase') kept.push(source);
  }
  return kept;
}

/**
 * Throws when a Couchbase connection is used while its Phase 8 slice is still
 * off. ClickHouse connections always pass.
 */
export async function assertSliceForConnection(
  slice: Slice,
  connectionId: string | undefined,
): Promise<void> {
  if (connectionId == null || connectionId === '') return;
  if (isCouchbaseSliceEnabled(slice)) return;
  const kind = await resolveConnectionKind(connectionId);
  if (kind === 'couchbase') {
    throw new CouchbaseNotReadyError(slice);
  }
}

/** Dialect a connection accepts for raw SQL and AI/MCP prompts. */
export async function queryLanguageForConnection(
  connectionId: string,
): Promise<QueryLanguage> {
  const kind = await resolveConnectionKind(connectionId);
  return kind === 'couchbase' ? 'sqlpp' : 'clickhouse';
}

type Rendered = {
  sql: string;
  params: Record<string, unknown>;
  dialect?: string;
};

export async function renderChartConfig(
  config: ChartConfigWithOptDateRangeEx,
  metadata: Parameters<typeof renderClickhouseChart>[1],
  querySettings?: QuerySettings,
): Promise<Rendered | SqlppQuery> {
  const kind = await resolveConnectionKind(config.connection);
  if (kind === 'couchbase') {
    return renderChartConfigCouchbase(config, metadata, querySettings);
  }
  return renderClickhouseChart(config, metadata, querySettings);
}

export function formatQueryForDisplay(q: Rendered): string {
  if (q.dialect === 'sqlpp')
    return sqlppToDisplay({ sql: q.sql, params: q.params });
  return parameterizedQueryToSql({ sql: q.sql, params: q.params });
}

export function isMissingColumnError(error: unknown): boolean {
  return chMissingColumn(error) || cbMissingColumn(error);
}

export function isAccessDeniedError(error: unknown): boolean {
  return chAccessDenied(error) || cbAccessDenied(error);
}
