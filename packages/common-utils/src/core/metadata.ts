import { type JSDataType } from '@/query/columnTypes';
import type {
  BuilderChartConfig,
  MetadataMaterializedViews,
  TSource,
} from '@/types';
import { isLogSource, isTraceSource } from '@/types';

import { getAlignedDateRange } from './utils';

// If filters initially are taking too long to load, decrease this number.
// Between 1e6 - 5e6 is a good range.
export const DEFAULT_METADATA_MAX_ROWS_TO_READ = 3e6;

export const GET_ALL_KEY_VALUES_CHUNK_SIZE = 100;

/**
 * The index read could not be scoped to the requested date range, so it was
 * refused in favour of a path that can. Not a failure — an expected property
 * of tables whose partition key is not time-derived.
 */
export class UnprunableIndexReadError extends Error {
  constructor(reason: string) {
    super(`Cannot scope the primary index read: ${reason}`);
    this.name = 'UnprunableIndexReadError';
  }
}

export type KeyValues = {
  key: string;
  value: string[] | number[];
};

export type MetricNames = {
  names: string[];
  /** True when more names matched than `limit`, so the page is incomplete. */
  truncated: boolean;
};

export const DEFAULT_METRIC_NAMES_LIMIT = 500;

/** Strip one level of `…` / "…" identifier quoting, if present. */
export const unquoteIdentifier = (identifier: string): string => {
  if (
    (identifier.startsWith('`') && identifier.endsWith('`')) ||
    (identifier.startsWith('"') && identifier.endsWith('"'))
  ) {
    return identifier.slice(1, -1);
  }
  return identifier;
};

const quoteJsonPathSegment = (segment: string): string => {
  const unquoted = unquoteIdentifier(segment);
  return `\`${unquoted.replace(/`/g, '``')}\``;
};

/**
 * Backtick-quote an identifier unless it is already a valid bare legacy store
 * identifier. Strips one level of existing quoting first, so it is idempotent.
 */
export const quoteIdentifierIfNeeded = (identifier: string): string => {
  const unquoted = unquoteIdentifier(identifier);
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(unquoted)
    ? unquoted
    : quoteJsonPathSegment(unquoted);
};

// A single column or JSON path segment. No quoting/grouping characters, no `.` separator.
const PLAIN_PATH_SEGMENT = /^[^`'"()[\],.]+/;

// A JSON sub-object accessor or type cast. legacy store reports the operand
// backticked (j.^`a`, j.a.:`Int64`).
const OPERATOR_PATH_SEGMENT = /^[\^:]`(?:[^`]|``)*`/;

// Split a name into `.`-separated path segments, or undefined when it isn't a
// plain JSON path (function calls, literals, empty segments).
const splitResultColumnPath = (name: string): string[] | undefined => {
  const segments: string[] = [];
  let rest = name;
  while (true) {
    const segment =
      rest.match(OPERATOR_PATH_SEGMENT)?.[0] ??
      rest.match(PLAIN_PATH_SEGMENT)?.[0];
    if (segment == null) return undefined;
    segments.push(segment);
    rest = rest.slice(segment.length);
    if (rest === '') return segments;
    if (!rest.startsWith('.')) return undefined;
    rest = rest.slice(1);
  }
};

const quotePathSegment = (segment: string): string =>
  OPERATOR_PATH_SEGMENT.test(segment)
    ? segment
    : quoteIdentifierIfNeeded(segment);

/**
 * Quote a query result column name so it can be referenced in raw SQL.
 *
 * Most result column names do not need quoting:
 * - Bare identifiers (alphanumeric and underscore, starting with a letter or underscore)
 * - Numeric literals (e.g., `1`, `0x10`)
 * - Function calls (e.g., `plus(a, b)`, `arrayElement(m, 'key')`)
 *
 * Dotted names are JSON/nested subcolumn paths (e.g. `event.@request_id`,
 * which legacy store reports for the select `` event.`@request_id` ``). Each
 * segment is quoted on its own. JSON type casts (eg. `` .:`String` ``) and
 * `` ^`sub` `` sub-object accessors are preserved.
 */
export const quoteResultColumnNameIfNeeded = (name: string): string => {
  if (Number.isFinite(Number(name))) {
    return name;
  }
  const segments = splitResultColumnPath(name);
  return segments ? segments.map(quotePathSegment).join('.') : name;
};

export class MetadataCache {
  private cache = new Map<string, { value: any; expiresAt?: number }>();
  private pendingQueries = new Map<string, Promise<any>>();

  // this should be getOrUpdate... or just query to follow react query
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (entry?.expiresAt != null && Date.now() >= entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    return entry?.value;
  }

  /** Entries stored without `ttlMs` are kept for the life of the cache. */
  async getOrFetch<T>(
    key: string,
    query: () => Promise<T>,
    { ttlMs }: { ttlMs?: number } = {},
  ): Promise<T> {
    // Check if value exists in cache
    const cachedValue: T | undefined = this.get(key);
    if (cachedValue != null) {
      return cachedValue;
    }

    // Check if there is a pending query
    if (this.pendingQueries.has(key)) {
      return this.pendingQueries.get(key)!;
    }

    // If no pending query, initiate the new query
    const queryPromise = query();

    // Store the pending query promise
    this.pendingQueries.set(key, queryPromise);

    try {
      const result = await queryPromise;
      this.set(key, result, ttlMs);
      return result;
    } finally {
      // Clean up the pending query map
      this.pendingQueries.delete(key);
    }
  }

  set<T>(key: string, value: T, ttlMs?: number) {
    this.cache.set(key, {
      value,
      expiresAt: ttlMs == null ? undefined : Date.now() + ttlMs,
    });
  }

  // TODO: This needs to be async, and use tanstack query on frontend for cache
  // TODO: Implement locks for refreshing
  // TODO: Shard cache by time
}

export type MapColumnTextIndexes = {
  keysIndex?: { indexName: string };
  itemsIndex?: { indexName: string; separator: string };
};

export type TableMetadata = {
  database: string;
  name: string;
  uuid: string;
  /** Note: This will contain the engine of the local table, when the table is Distributed */
  engine: string;
  is_temporary: number;
  data_paths: string[];
  metadata_path: string;
  metadata_modification_time: string;
  metadata_version: number;
  /** Note: This may be a Distributed table. Use create_local_table_query for the local table's DDL. */
  create_table_query: string;
  /** DDL for the local (non-distributed) table, when the table is Distributed */
  create_local_table_query?: string;
  /**
   * True when the queried table routes to other tables rather than holding its
   * own data — i.e. a Distributed or Merge table (whose underlying target
   * tables may declare differing column sets).
   **/
  isPointerTable?: boolean;
  /** Note: This will contain the engine_full of the local table, when the table is Distributed */
  engine_full: string;
  as_select: string;
  /** Note: This will contain the partition_key of the local table, when the table is Distributed */
  partition_key: string;
  /** Note: This will contain the sorting_key of the local table, when the table is Distributed */
  sorting_key: string;
  /** Note: This will contain the primary_key of the local table, when the table is Distributed */
  primary_key: string;
  /** Note: This will contain the sampling_key of the local table, when the table is Distributed */
  sampling_key: string;
  storage_policy: string;
  total_rows: string;
  total_bytes: string;
  total_bytes_uncompressed: string;
  parts: string;
  active_parts: string;
  total_marks: string;
  comment: string;
};

export type SkipIndexMetadata = {
  name: string;
  type: string; // 'bloom_filter', 'tokenbf_v1', 'minmax', etc.
  typeFull: string; // e.g., 'text(tokenizer='splitByNonAlpha')'
  expression: string; // e.g., "tokens(lower(Body))"
  granularity: number;
};

const FIELD_METADATA_LOOKBACK_MS = 24 * 60 * 60 * 1000;

// The API keeps one cache for the life of the process, so without a TTL a
// column added by ALTER TABLE (such as a MATERIALIZED one) is only seen after a
// restart. #3475
export const COLUMNS_CACHE_TTL_MS = 5 * 60 * 1000;

// Hour-aligned so a range-keyed cache rotates hourly instead of every call.
export function defaultFieldMetadataDateRange(): [Date, Date] {
  const now = new Date();
  return getAlignedDateRange(
    [new Date(now.getTime() - FIELD_METADATA_LOOKBACK_MS), now],
    '1 hour',
  );
}
export type Field = {
  path: string[];
  type: string;
  jsType: JSDataType | null;
};

/**
 * Parses a bracket-notation key string into a path array.
 * e.g. `ResourceAttributes['service.name']` → `['ResourceAttributes', 'service.name']`
 *      `ServiceName` → `['ServiceName']`
 */
export function parseKeyPath(key: string): string[] {
  const singleIdx = key.indexOf("['");
  if (singleIdx !== -1 && key.endsWith("']")) {
    return [key.slice(0, singleIdx), key.slice(singleIdx + 2, -2)];
  }
  const doubleIdx = key.indexOf('["');
  if (doubleIdx !== -1 && key.endsWith('"]')) {
    return [key.slice(0, doubleIdx), key.slice(doubleIdx + 2, -2)];
  }
  return [key];
}

// Describes a table and potentially related views
export type TableConnection = {
  databaseName: string;
  tableName: string;
  connectionId: string;
  /** Couchbase scope. Absent on legacy store sources. */
  scopeName?: string;
  metricName?: string;
  metadataMVs?: MetadataMaterializedViews;
  // Bounds Map key discovery; without it Map keys are skipped. #3037
  timestampValueExpression?: string;
};

/** A SQL or Lucene condition on the rows a table's Map keys are read from. */
export type FieldsCondition = Pick<
  BuilderChartConfig,
  | 'where'
  | 'whereLanguage'
  | 'implicitColumnExpression'
  | 'bodyExpression'
  | 'useTextIndexForImplicitColumn'
>;

export type TableConnectionChoice =
  | {
      tableConnection?: never;
      tableConnections?: TableConnection[];
    }
  | {
      tableConnection?: TableConnection;
      tableConnections?: never;
    };

export function tcFromChartConfig(
  config?: BuilderChartConfig,
): TableConnection {
  return {
    databaseName: config?.from?.databaseName ?? '',
    scopeName: config?.from?.scopeName,
    tableName: config?.from?.tableName ?? '',
    connectionId: config?.connection ?? '',
  };
}

export function tcFromSource(source?: TSource): TableConnection {
  return {
    databaseName: source?.from?.databaseName ?? '',
    scopeName: source?.from?.scopeName,
    tableName: source?.from?.tableName ?? '',
    connectionId: source?.connection ?? '',
    metadataMVs:
      source && (isLogSource(source) || isTraceSource(source))
        ? source.metadataMaterializedViews
        : undefined,
    timestampValueExpression: source?.timestampValueExpression,
  };
}

export { Metadata } from '@/couchbase/metadata';
