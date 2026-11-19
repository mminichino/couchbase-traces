import { scrubMessage } from '@couchbase-traces/common-utils/dist/couchbase/errors';

/** Base class: every metadata-layer failure is one of these (plan §4). */
export class MetadataError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = new.target.name;
  }
}

/** Env config missing or malformed. Never retried. */
export class MetadataConfigError extends MetadataError {}

/** A unique key (lookup document) is already owned by another entity. */
export class DuplicateKeyError extends MetadataError {
  constructor(
    readonly kind: string,
    cause?: unknown,
  ) {
    super(`Duplicate key: ${kind}`, cause);
  }
}

export class NotFoundError extends MetadataError {}

/** A write was refused because the input breaks a stored-schema rule. */
export class ValidationError extends MetadataError {}

/** The document changed since it was read (CAS mismatch). */
export class CasConflictError extends MetadataError {}

/** Cluster unreachable, timed out, or a service is not available. */
export class MetadataUnavailableError extends MetadataError {}

/** A query needs an index that is missing or still building. */
export class IndexNotReadyError extends MetadataError {}

export class TransactionFailedError extends MetadataError {}

/** The stored `meta::schema` is from a newer release (plan D8). */
export class SchemaVersionError extends MetadataError {
  constructor(
    readonly stored: number,
    readonly code: number,
  ) {
    super(
      `Metadata schema version ${stored} is newer than this release supports (${code}). Deploy a newer release.`,
    );
  }
}

const UNAVAILABLE = new Set([
  'TimeoutError',
  'UnambiguousTimeoutError',
  'AmbiguousTimeoutError',
  'TemporaryFailureError',
  'ServiceNotAvailableError',
  'RequestCanceledError',
  'AuthenticationFailureError',
  'BucketNotFoundError',
  'ScopeNotFoundError',
  'CollectionNotFoundError',
]);

const INDEX_CODES = new Set([4000, 12003, 12004, 12016]);

function serverCode(err: unknown): number | undefined {
  if (typeof err !== 'object' || err === null || !('context' in err)) {
    return undefined;
  }
  const ctx = err.context;
  if (typeof ctx !== 'object' || ctx === null) return undefined;
  const code = 'first_error_code' in ctx ? ctx.first_error_code : undefined;
  return typeof code === 'number' ? code : undefined;
}

/**
 * Converts an SDK error once, scrubbing secrets and connection strings from
 * the message. Errors that are already MetadataErrors pass through.
 */
export function fromCouchbaseError(
  err: unknown,
  opts: { kind?: string; secrets?: string[] } = {},
): Error {
  if (err instanceof MetadataError) return err;
  const name = err instanceof Error ? err.name : '';
  const message = scrubMessage(
    err instanceof Error ? err.message : String(err),
    opts.secrets,
  );
  if (name === 'DocumentExistsError') {
    return new DuplicateKeyError(opts.kind ?? 'document', err);
  }
  if (name === 'DocumentNotFoundError') return new NotFoundError(message, err);
  if (name === 'CasMismatchError') return new CasConflictError(message, err);
  if (name === 'IndexNotFoundError' || INDEX_CODES.has(serverCode(err) ?? -1)) {
    return new IndexNotReadyError(message, err);
  }
  if (name.startsWith('Transaction')) {
    return new TransactionFailedError(message, err);
  }
  if (UNAVAILABLE.has(name)) return new MetadataUnavailableError(message, err);
  return new MetadataError(message, err);
}
