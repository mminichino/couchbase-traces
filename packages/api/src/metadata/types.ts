import type { MetaCollection } from '@couchbase-traces/common-utils/dist/couchbase/metadataKeyspace';

import type { Id } from './ids';
import type { Repositories } from './repos';
import type {
  AggregatedAlertHistory,
  DateRange,
  GroupedAlertHistory,
  StructuredWindow,
  TransitionWindow,
} from './schemas/alertHistory';

export type { Id, MetaCollection };
export type TeamId = Id;

/** Opaque compare-and-swap token from the backend that produced it. */
export type Cas = object;

export type Consistency = 'request_plus' | 'not_bounded';

export type Versioned<T> = { value: T; cas: Cas; expiry?: Date };

export type ListOptions<S extends string> = {
  sort?: { field: S; dir: 'asc' | 'desc' }[];
  /** Hard cap 1000 unless a repository says otherwise. */
  limit?: number;
  /** Opaque keyset cursor. */
  after?: string;
  consistency?: Consistency;
};

export type Page<T> = { items: T[]; next?: string };

export type ExpiryOptions = {
  /** Absolute expiry; omitted means the document never expires. */
  expiry?: Date;
  /**
   * Keep the current expiry on replace/upsert. Without it Couchbase clears
   * the expiry on every mutation (plan §5, TTL docs mutated later).
   */
  preserveExpiry?: boolean;
};

/**
 * Key-value primitives every metadata backend implements. Couchbase in
 * production (couchbase/kv.ts), memory in unit tests (testing/memoryKv.ts).
 * Uniqueness, leases, and the schema marker are written once on top of it,
 * and testing/contract.ts runs the same suite against both backends.
 */
export interface MetaKv {
  get<T>(c: MetaCollection, key: string): Promise<Versioned<T> | null>;
  getMany<T>(c: MetaCollection, keys: string[]): Promise<Map<string, T>>;
  /** Throws DuplicateKeyError when the key exists. */
  insert<T>(
    c: MetaCollection,
    key: string,
    value: T,
    o?: { expiry?: Date },
  ): Promise<Cas>;
  /** Throws NotFoundError, or CasConflictError when `cas` no longer matches. */
  replace<T>(
    c: MetaCollection,
    key: string,
    value: T,
    o?: ExpiryOptions & { cas?: Cas },
  ): Promise<Cas>;
  upsert<T>(
    c: MetaCollection,
    key: string,
    value: T,
    o?: ExpiryOptions,
  ): Promise<Cas>;
  /** False when the key does not exist; CasConflictError on a stale `cas`. */
  remove(c: MetaCollection, key: string, o?: { cas?: Cas }): Promise<boolean>;
  /** Sets a new absolute expiry; false when the key does not exist. */
  touch(c: MetaCollection, key: string, expiry: Date): Promise<boolean>;
}

export type FindScalar = string | number | boolean;

/**
 * One equality-filtered read over a collection. Repositories build these
 * from fixed shapes (never from request input), and each shape is served by
 * an index in METADATA_INDEXES. `present` lets an index on a field serve a
 * query that has no equality filter on it.
 */
export type FindSpec = {
  where?: Record<string, FindScalar>;
  present?: string[];
  /** Case-insensitive substring match on a string field (literal, no regex). */
  contains?: { field: string; value: string };
  /** The array field holds every value (Mongo `$all`). */
  hasAll?: { field: string; values: readonly string[] };
  /** `KEY_FIELD` orders by document key, which is also creation order. */
  orderBy?: { field: string; dir: 'asc' | 'desc' }[];
  /** Hard cap 1000. */
  limit?: number;
  /** Rows to skip after ordering; pair it with a stable `orderBy`. */
  offset?: number;
  /** Overrides CBT_METADATA_QUERY_TIMEOUT_MS for this read (SQL++ backends). */
  timeoutMs?: number;
};

/** Pseudo field for `orderBy`: the document key (`META().id`). */
export const KEY_FIELD = '$key';

export type Found<T> = { key: string; value: T };

/**
 * Secondary reads both backends implement: SQL++ over GSI on Couchbase
 * (couchbase/find.ts, request_plus), a scan in memory (testing/memoryFind.ts).
 */
export interface MetaFind {
  find<T>(c: MetaCollection, spec: FindSpec): Promise<Found<T>[]>;
  count(
    c: MetaCollection,
    spec: Omit<FindSpec, 'orderBy' | 'offset'>,
  ): Promise<number>;
  /** Distinct elements of an array field across the matching documents. */
  distinct(
    c: MetaCollection,
    field: string,
    spec: Omit<FindSpec, 'orderBy' | 'offset' | 'limit'>,
  ): Promise<string[]>;
}

/**
 * Reads and writes that commit together or not at all (plan D9, §5). The
 * Couchbase implementation runs `find` through the transaction's own query
 * context, so it sees writes made earlier in the same attempt.
 */
export interface MetaTx {
  get<T>(c: MetaCollection, key: string): Promise<T | null>;
  find<T>(c: MetaCollection, spec: FindSpec): Promise<Found<T>[]>;
  /** Throws NotFoundError when the key does not exist. */
  replace<T>(c: MetaCollection, key: string, value: T): Promise<void>;
  /** Throws NotFoundError when the key does not exist. */
  remove(c: MetaCollection, key: string): Promise<void>;
}

export interface MetaTransactions {
  /**
   * The callback may run more than once (the SDK retries conflicts), so it
   * must be idempotent apart from its transaction writes.
   */
  run<R>(fn: (tx: MetaTx) => Promise<R>): Promise<R>;
}

/** Filter and keyset position of one alerts-page read; `team` is required. */
export type AlertsPageQuery = {
  team: string;
  /** Alerts with any of these tags. */
  tags?: readonly string[];
  /** A missing state counts as `OK` (the schema default). */
  states?: readonly string[];
  /** A missing source counts as `saved_search`. */
  sources?: readonly string[];
  /** Case-insensitive substring of the display name. */
  search?: string;
  createdBy?: string;
  /** Strictly after this `(displayName, id)`; null name is the null block. */
  after?: { name: string | null; id: string };
  /** Returns at most this many rows; omitted means all (hard cap 1000). */
  limit?: number;
};

/**
 * The alert reads FindSpec cannot express: the alerts-page filter and
 * keyset, and the alert-history grouping and window functions. SQL++ on
 * Couchbase (couchbase/alertQueries.ts), a scan in memory
 * (testing/memoryAlertQueries.ts); both run testing/alertsContract.ts.
 * History reads cover non-ERROR rows unless the name says otherwise.
 */
export interface MetaAlertQueries {
  /** Alerts ordered by `(displayName, id)` with null and missing first. */
  alertsPage(q: AlertsPageQuery): Promise<Found<unknown>[]>;
  alertsCount(q: Omit<AlertsPageQuery, 'after' | 'limit'>): Promise<number>;
  /** Newest row per group with `createdAt` in range. */
  latestPerGroup(
    alert: Id,
    range: DateRange,
  ): Promise<AggregatedAlertHistory[]>;
  /** Rows in range, ordered by group then newest first. */
  rangeExcludingErrors(
    alert: Id,
    range: DateRange,
  ): Promise<AggregatedAlertHistory[]>;
  /** One entry per `createdAt` (ERROR rows included), newest first. */
  groupedByWindow(
    alert: Id,
    range: DateRange,
    limit: number,
  ): Promise<GroupedAlertHistory[]>;
  /** As groupedByWindow, keeping every row with its group identity. */
  structuredWindows(
    alert: Id,
    range: DateRange,
    limit: number,
  ): Promise<StructuredWindow[]>;
  /** One entry per `createdAt`, oldest first. */
  transitionWindows(alert: Id, range: DateRange): Promise<TransitionWindow[]>;
  /** Keys of the alert's ERROR rows with `createdAt` in range. */
  errorRowKeys(alert: Id, range: DateRange): Promise<string[]>;
  /** Every stored row, ERROR rows included, oldest first. */
  historyRows(alert: Id, range: DateRange): Promise<Found<unknown>[]>;
}

export const FIND_LIMIT_MAX = 1000;

export type Lease = {
  name: string;
  owner: string;
  cas: Cas;
  expiresAt: Date;
};

export interface LockService {
  /** Null while another owner holds an unexpired lease. */
  acquire(name: string, ttlMs: number, owner: string): Promise<Lease | null>;
  /** False when the lease expired or was taken over. */
  renew(lease: Lease, ttlMs: number): Promise<Lease | null>;
  release(lease: Lease): Promise<void>;
}

export type MetadataState =
  | 'disabled'
  | 'connecting'
  | 'provisioning'
  | 'indexing'
  | 'ready'
  | 'degraded'
  | 'closed';

export type MetadataReadiness = {
  ready: boolean;
  state: MetadataState;
  /** Missing scope, collections, or indexes, or a degraded reason. */
  detail?: string[];
};

/**
 * Grows by one entity slice per phase (C1–C4), so an unswitched entity
 * cannot be half-used. C1: teams, users, team invites.
 */
export interface MetadataStore extends Repositories {
  kv: MetaKv;
  find: MetaFind;
  locks: LockService;
  tx: MetaTransactions;
  alertQueries: MetaAlertQueries;
  readiness(): MetadataReadiness;
  close(): Promise<void>;
}
