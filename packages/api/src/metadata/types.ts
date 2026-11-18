import type { MetaCollection } from '@couchbase-traces/common-utils/dist/couchbase/metadataKeyspace';

import type { Id } from './ids';

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
 * Grows by one entity slice per phase (C1–C4); C0 exposes the shared
 * primitives only, so an unswitched entity cannot be half-used.
 */
export interface MetadataStore {
  kv: MetaKv;
  locks: LockService;
  readiness(): MetadataReadiness;
  close(): Promise<void>;
}
