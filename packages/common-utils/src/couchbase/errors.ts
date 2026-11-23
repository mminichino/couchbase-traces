import { QueryError } from '@/query/errors';

/** Raised when a construct has no SQL++ equivalent. */
export class CouchbaseUnsupportedError extends Error {
  readonly code: 'COUCHBASE_UNSUPPORTED';

  constructor(what: string) {
    super(`Not supported on Couchbase: ${what}.`);
    this.code = 'COUCHBASE_UNSUPPORTED';
    this.name = 'CouchbaseUnsupportedError';
  }
}

export const COUCHBASE_ERROR_CODES = [
  'STATEMENT_NOT_ALLOWED',
  'MULTIPLE_STATEMENTS',
  'INVALID_CONNECTION',
  'CONNECTION_NOT_FOUND',
  'WRONG_CONNECTION_KIND',
  'AUTHENTICATION_FAILED',
  'PERMISSION_DENIED',
  'KEYSPACE_NOT_FOUND',
  'INDEX_NOT_FOUND',
  'PARSING_FAILED',
  'PLANNING_FAILED',
  'TIMEOUT',
  'SERVICE_UNAVAILABLE',
  'RESULT_TOO_LARGE',
  'CANCELED',
  'INTERNAL',
] as const;

export type CouchbaseErrorCode = (typeof COUCHBASE_ERROR_CODES)[number];

export type SerializedQueryError = {
  code: CouchbaseErrorCode;
  message: string;
  sqlppCode: number | null;
};

const HTTP_STATUS = new Map<CouchbaseErrorCode, number>([
  ['STATEMENT_NOT_ALLOWED', 400],
  ['MULTIPLE_STATEMENTS', 400],
  ['INVALID_CONNECTION', 400],
  ['CONNECTION_NOT_FOUND', 404],
  ['WRONG_CONNECTION_KIND', 409],
  ['AUTHENTICATION_FAILED', 502],
  ['PERMISSION_DENIED', 403],
  ['KEYSPACE_NOT_FOUND', 400],
  ['INDEX_NOT_FOUND', 400],
  ['PARSING_FAILED', 400],
  ['PLANNING_FAILED', 400],
  ['TIMEOUT', 504],
  ['SERVICE_UNAVAILABLE', 502],
  ['RESULT_TOO_LARGE', 413],
  ['CANCELED', 499],
  ['INTERNAL', 500],
]);

const RETRIABLE = new Set<CouchbaseErrorCode>([
  'TIMEOUT',
  'SERVICE_UNAVAILABLE',
]);

export function isCouchbaseErrorCode(v: unknown): v is CouchbaseErrorCode {
  return COUCHBASE_ERROR_CODES.some(c => c === v);
}

export function httpStatusForCode(code: CouchbaseErrorCode): number {
  return HTTP_STATUS.get(code) ?? 500;
}

export class CouchbaseQueryError extends QueryError {
  readonly code: CouchbaseErrorCode;
  readonly sqlppCode: number | null;
  readonly retriable: boolean;
  readonly httpStatus: number;

  constructor(
    code: CouchbaseErrorCode,
    message: string,
    statement: string,
    extra?: { sqlppCode?: number | null; cause?: unknown },
  ) {
    super(message, statement);
    this.name = 'CouchbaseQueryError';
    this.code = code;
    this.sqlppCode = extra?.sqlppCode ?? null;
    this.retriable = RETRIABLE.has(code);
    this.httpStatus = httpStatusForCode(code);
    if (extra?.cause !== undefined) {
      Object.defineProperty(this, 'cause', {
        value: extra.cause,
        enumerable: false,
        writable: true,
        configurable: true,
      });
    }
  }
}

const CONNSTR_RE = /couchbases?:\/\/[^\s'"<>]*/gi;
const SECRET_PARAM_RE =
  /\b(password|passwd|pwd|secret|token|authorization)(["']?\s*[:=]\s*["']?)[^\s"'&,;]+/gi;
const PEM_RE = /-----BEGIN [A-Z ]+-----[\s\S]*?(-----END [A-Z ]+-----|$)/g;

/** Removes connection strings, credentials, and PEM blocks from a message. */
export function scrubMessage(message: string, secrets: string[] = []): string {
  let out = message
    .replace(PEM_RE, '[certificate]')
    .replace(CONNSTR_RE, '[connection string]')
    .replace(SECRET_PARAM_RE, '$1$2[redacted]');
  for (const s of secrets) {
    if (s && s.length >= 3) {
      out = out.split(s).join('[redacted]');
    }
  }
  return out;
}

/** Reads a property of an unknown value without asserting its shape. */
function prop(o: unknown, key: string): unknown {
  return o != null && typeof o === 'object' ? Reflect.get(o, key) : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

/**
 * The SDK's own diagnosis of a failed operation, for logs (D18): its error
 * class, the core error code and message, and the request context (last
 * dispatched node, retry reasons, timings). `serialize` keeps none of it.
 * Scrubbed of connection strings and `secrets`.
 */
export function describeSdkError(
  err: unknown,
  secrets: string[] = [],
): Record<string, unknown> {
  const sdk = err instanceof CouchbaseQueryError ? err.cause : err;
  const cause = prop(sdk, 'cause');
  const context = prop(sdk, 'context');
  let ctx: unknown;
  try {
    ctx =
      context == null
        ? undefined
        : JSON.parse(scrubMessage(JSON.stringify(context), secrets));
  } catch {
    ctx = '[unserializable context]';
  }
  return {
    name: errorClassName(sdk),
    message: scrubMessage(str(prop(sdk, 'message')) ?? String(sdk), secrets),
    ...(cause != null && {
      cause: {
        code: prop(cause, 'code'),
        message: scrubMessage(str(prop(cause, 'message')) ?? '', secrets),
      },
    }),
    ...(ctx !== undefined && { context: ctx }),
  };
}

function errorClassName(err: unknown): string {
  const ctorName = str(prop(prop(err, 'constructor'), 'name'));
  if (ctorName && ctorName !== 'Error' && ctorName !== 'Object') {
    return ctorName;
  }
  return str(prop(err, 'name')) ?? '';
}

function firstServerError(err: unknown): {
  code: number | null;
  message: string | null;
} {
  const ctx = prop(err, 'context');
  const ctxCode = prop(ctx, 'first_error_code');
  let code: number | null =
    typeof ctxCode === 'number' && ctxCode > 0 ? ctxCode : null;
  let message: string | null = str(prop(ctx, 'first_error_message')) ?? null;
  const body = prop(ctx, 'http_response_body');
  if ((code == null || message == null) && typeof body === 'string') {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      // body is not JSON; fall back to the SDK message
    }
    const errors = prop(parsed, 'errors');
    const first: unknown = Array.isArray(errors) ? errors[0] : undefined;
    const firstCode = prop(first, 'code');
    if (code == null && typeof firstCode === 'number') code = firstCode;
    if (message == null) message = str(prop(first, 'msg')) ?? null;
  }
  return { code, message };
}

const NETWORK_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ETIMEDOUT',
]);

function isNetworkError(err: unknown): boolean {
  const code = str(prop(err, 'code'));
  const causeCode = str(prop(prop(err, 'cause'), 'code'));
  return (
    (code != null && NETWORK_CODES.has(code)) ||
    (causeCode != null && NETWORK_CODES.has(causeCode))
  );
}

export function fromSdkError(
  err: unknown,
  statement: string,
  opts: { aborted?: boolean; connecting?: boolean; secrets?: string[] } = {},
): CouchbaseQueryError {
  if (err instanceof CouchbaseQueryError) return err;

  const name = errorClassName(err);
  const server = firstServerError(err);
  const sdkMessage =
    (err != null && typeof err === 'object'
      ? str(prop(err, 'message'))
      : str(String(err))) ??
    (name || 'Unknown error');
  const message = scrubMessage(server.message ?? sdkMessage, opts.secrets);
  const sqlppCode = server.code;

  const make = (code: CouchbaseErrorCode) =>
    new CouchbaseQueryError(code, message, statement, {
      sqlppCode,
      cause: err,
    });

  if (name === 'RequestCanceledError' || name === 'AbortError') {
    if (opts.aborted) return make('CANCELED');
    return make('SERVICE_UNAVAILABLE');
  }
  if (opts.aborted) return make('CANCELED');

  // The SDK raises AuthenticationFailureError for 13014 too, so check it first.
  if (sqlppCode === 13014 || /does not have credentials/i.test(message)) {
    return make('PERMISSION_DENIED');
  }
  if (name === 'AuthenticationFailureError')
    return make('AUTHENTICATION_FAILED');
  if (
    name === 'BucketNotFoundError' ||
    name === 'ScopeNotFoundError' ||
    name === 'CollectionNotFoundError' ||
    sqlppCode === 12003
  ) {
    return make('KEYSPACE_NOT_FOUND');
  }
  if (name === 'IndexNotFoundError' || name === 'IndexFailureError') {
    return make('INDEX_NOT_FOUND');
  }
  if (name === 'ParsingFailureError') return make('PARSING_FAILED');
  if (name === 'PlanningFailureError') return make('PLANNING_FAILED');
  if (
    name === 'UnambiguousTimeoutError' ||
    name === 'AmbiguousTimeoutError' ||
    name === 'TimeoutError'
  ) {
    return make('TIMEOUT');
  }
  if (name === 'ServiceNotAvailableError' || isNetworkError(err)) {
    return make('SERVICE_UNAVAILABLE');
  }
  return make('INTERNAL');
}

export function serialize(e: CouchbaseQueryError): SerializedQueryError {
  return { code: e.code, message: e.message, sqlppCode: e.sqlppCode };
}

export function deserialize(
  s: SerializedQueryError,
  statement: string,
): CouchbaseQueryError {
  const code = isCouchbaseErrorCode(s?.code) ? s.code : 'INTERNAL';
  return new CouchbaseQueryError(
    code,
    typeof s?.message === 'string' ? s.message : 'Unknown error',
    statement,
    { sqlppCode: typeof s?.sqlppCode === 'number' ? s.sqlppCode : null },
  );
}

export function isSerializedQueryError(v: unknown): v is SerializedQueryError {
  return (
    typeof prop(v, 'code') === 'string' &&
    typeof prop(v, 'message') === 'string'
  );
}

/** Always false: Couchbase reports missing fields as MISSING, not as errors. */
export function isMissingColumnError(_e: unknown): boolean {
  return false;
}

export function isAccessDeniedError(e: unknown): boolean {
  return e instanceof CouchbaseQueryError && e.code === 'PERMISSION_DENIED';
}

/** SQL++ error INFER raises when the keyspace has no documents to sample. */
export const INFER_NO_DOCUMENTS = 7014;

/**
 * True for INFER's "No documents found, unable to infer schema". An empty
 * collection has no schema yet, which is not a failure: upstream DESCRIBE
 * TABLE on an empty table succeeds. The message check covers errors whose
 * SQL++ code was dropped on the way (e.g. serialized by an older proxy).
 */
export function isEmptyInferError(e: unknown): boolean {
  if (!(e instanceof CouchbaseQueryError)) return false;
  if (e.sqlppCode === INFER_NO_DOCUMENTS) return true;
  return e.sqlppCode == null && /unable to infer schema/i.test(e.message);
}
