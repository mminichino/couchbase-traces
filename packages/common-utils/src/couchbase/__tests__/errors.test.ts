import {
  CouchbaseQueryError,
  deserialize,
  fromSdkError,
  httpStatusForCode,
  isAccessDeniedError,
  isMissingColumnError,
  isSerializedQueryError,
  scrubMessage,
  serialize,
} from '@/couchbase/errors';
import { QueryError } from '@/query';

// Objects shaped like the SDK's errors: the class name is what matters.
function sdkError(
  className: string,
  message = `${className} message`,
  context?: Record<string, unknown>,
): Error {
  class SdkError extends Error {
    context = context;
    constructor(m: string) {
      super(m);
      this.name = className;
    }
  }
  Object.defineProperty(SdkError, 'name', { value: className });
  return new SdkError(message);
}

function queryBody(code: number, msg: string) {
  return { http_response_body: JSON.stringify({ errors: [{ code, msg }] }) };
}

describe('fromSdkError', () => {
  it.each([
    ['AuthenticationFailureError', 'AUTHENTICATION_FAILED', 502, false],
    ['ParsingFailureError', 'PARSING_FAILED', 400, false],
    ['PlanningFailureError', 'PLANNING_FAILED', 400, false],
    ['IndexNotFoundError', 'INDEX_NOT_FOUND', 400, false],
    ['IndexFailureError', 'INDEX_NOT_FOUND', 400, false],
    ['BucketNotFoundError', 'KEYSPACE_NOT_FOUND', 400, false],
    ['ScopeNotFoundError', 'KEYSPACE_NOT_FOUND', 400, false],
    ['CollectionNotFoundError', 'KEYSPACE_NOT_FOUND', 400, false],
    ['UnambiguousTimeoutError', 'TIMEOUT', 504, true],
    ['AmbiguousTimeoutError', 'TIMEOUT', 504, true],
    ['TimeoutError', 'TIMEOUT', 504, true],
    ['ServiceNotAvailableError', 'SERVICE_UNAVAILABLE', 502, true],
    ['RequestCanceledError', 'SERVICE_UNAVAILABLE', 502, true],
    ['SomethingElseError', 'INTERNAL', 500, false],
  ])('%s → %s', (name, code, status, retriable) => {
    const e = fromSdkError(sdkError(name), 'SELECT 1');
    expect(e).toBeInstanceOf(CouchbaseQueryError);
    expect(e).toBeInstanceOf(QueryError);
    expect(e.code).toBe(code);
    expect(e.httpStatus).toBe(status);
    expect(e.retriable).toBe(retriable);
    expect(e.query).toBe('SELECT 1');
  });

  it('maps server code 12003 to KEYSPACE_NOT_FOUND with the server message', () => {
    const e = fromSdkError(
      sdkError(
        'CouchbaseError',
        'generic',
        queryBody(12003, 'Keyspace not found in CB datastore'),
      ),
      's',
    );
    expect(e.code).toBe('KEYSPACE_NOT_FOUND');
    expect(e.sqlppCode).toBe(12003);
    expect(e.message).toBe('Keyspace not found in CB datastore');
  });

  it('maps server code 13014 and credential messages to PERMISSION_DENIED', () => {
    expect(
      fromSdkError(
        sdkError('CouchbaseError', 'x', {
          first_error_code: 13014,
          first_error_message: 'denied',
        }),
        's',
      ),
    ).toMatchObject({
      code: 'PERMISSION_DENIED',
      httpStatus: 403,
      sqlppCode: 13014,
      message: 'denied',
    });
    expect(
      fromSdkError(
        sdkError(
          'InternalServerFailureError',
          'User does not have credentials to run SELECT queries',
        ),
        's',
      ).code,
    ).toBe('PERMISSION_DENIED');
    expect(
      fromSdkError(
        sdkError('AuthenticationFailureError', 'authentication failure', {
          first_error_code: 13014,
          first_error_message: 'User does not have credentials to run SELECT',
        }),
        's',
      ).code,
    ).toBe('PERMISSION_DENIED');
  });

  it('maps RequestCanceledError after an abort to CANCELED', () => {
    expect(
      fromSdkError(sdkError('RequestCanceledError'), 's', { aborted: true }),
    ).toMatchObject({ code: 'CANCELED', httpStatus: 499 });
  });

  it('maps network errors to SERVICE_UNAVAILABLE', () => {
    const err = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    expect(fromSdkError(err, 's').code).toBe('SERVICE_UNAVAILABLE');
    const wrapped = Object.assign(new Error('fetch failed'), {
      cause: { code: 'ENOTFOUND' },
    });
    expect(fromSdkError(wrapped, 's').code).toBe('SERVICE_UNAVAILABLE');
  });

  it('handles non-errors and passes CouchbaseQueryError through', () => {
    expect(fromSdkError('boom', 's')).toMatchObject({
      code: 'INTERNAL',
      message: 'boom',
    });
    const original = new CouchbaseQueryError('TIMEOUT', 't', 's');
    expect(fromSdkError(original, 's')).toBe(original);
  });

  it('ignores a non-JSON response body', () => {
    const e = fromSdkError(
      sdkError('ParsingFailureError', 'parse', {
        http_response_body: '<html>',
      }),
      's',
    );
    expect(e.message).toBe('parse');
    expect(e.sqlppCode).toBeNull();
  });

  it('scrubs credentials and connection strings from messages', () => {
    const e = fromSdkError(
      sdkError(
        'AuthenticationFailureError',
        'auth failed for couchbases://user@cb.example.com?x=1 password=hunter2 key s3cr3t',
      ),
      's',
      { secrets: ['s3cr3t'] },
    );
    expect(e.message).not.toContain('cb.example.com');
    expect(e.message).not.toContain('hunter2');
    expect(e.message).not.toContain('s3cr3t');
  });
});

describe('scrubMessage', () => {
  it('removes PEM blocks', () => {
    expect(
      scrubMessage(
        'bad cert -----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE----- end',
      ),
    ).toBe('bad cert [certificate] end');
  });
});

describe('serialize / deserialize', () => {
  it('round-trips', () => {
    const e = new CouchbaseQueryError('PLANNING_FAILED', 'nope', 'SELECT', {
      sqlppCode: 4000,
    });
    const s = serialize(e);
    expect(s).toEqual({
      code: 'PLANNING_FAILED',
      message: 'nope',
      sqlppCode: 4000,
    });
    expect(isSerializedQueryError(s)).toBe(true);
    const back = deserialize(s, 'SELECT');
    expect(back).toMatchObject({
      code: 'PLANNING_FAILED',
      sqlppCode: 4000,
      httpStatus: 400,
    });
  });

  it('falls back to INTERNAL for unknown codes', () => {
    expect(
      deserialize({ code: 'NOPE' as never, message: 'm', sqlppCode: null }, 's')
        .code,
    ).toBe('INTERNAL');
    expect(isSerializedQueryError({ code: 1 })).toBe(false);
  });

  it('httpStatusForCode covers request errors', () => {
    expect(httpStatusForCode('CONNECTION_NOT_FOUND')).toBe(404);
    expect(httpStatusForCode('WRONG_CONNECTION_KIND')).toBe(409);
    expect(httpStatusForCode('STATEMENT_NOT_ALLOWED')).toBe(400);
  });
});

describe('helpers', () => {
  it('isMissingColumnError is always false', () => {
    expect(isMissingColumnError(new Error('Unknown identifier'))).toBe(false);
  });

  it('isAccessDeniedError checks PERMISSION_DENIED', () => {
    expect(
      isAccessDeniedError(
        new CouchbaseQueryError('PERMISSION_DENIED', 'x', 's'),
      ),
    ).toBe(true);
    expect(
      isAccessDeniedError(new CouchbaseQueryError('INTERNAL', 'x', 's')),
    ).toBe(false);
    expect(isAccessDeniedError(new Error('ACCESS_DENIED'))).toBe(false);
  });
});
