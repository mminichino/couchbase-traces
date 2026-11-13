/** Raised when a feature slice has not been ported to Couchbase yet. */
export class CouchbaseNotReadyError extends Error {
  readonly code: 'COUCHBASE_NOT_READY';

  constructor(what: string) {
    super(`This view does not support Couchbase sources yet (${what}).`);
    this.name = 'CouchbaseNotReadyError';
    this.code = 'COUCHBASE_NOT_READY';
  }
}

/** Raised when a ClickHouse construct has no SQL++ equivalent. */
export class CouchbaseUnsupportedError extends Error {
  readonly code: 'COUCHBASE_UNSUPPORTED';

  constructor(what: string) {
    super(`Not supported on Couchbase: ${what}.`);
    this.name = 'CouchbaseUnsupportedError';
    this.code = 'COUCHBASE_UNSUPPORTED';
  }
}
