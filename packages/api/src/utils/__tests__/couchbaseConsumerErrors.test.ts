import { CouchbaseQueryError } from '@couchbase-traces/common-utils/dist/couchbase/errors';
import {
  CouchbaseNotReadyError,
  CouchbaseUnsupportedError,
} from '@couchbase-traces/common-utils/dist/dataLayer';

import {
  couchbaseConsumerHttpResponse,
  couchbaseConsumerMcpError,
} from '@/utils/couchbaseConsumerErrors';

describe('couchbaseConsumerHttpResponse', () => {
  it('maps CouchbaseNotReadyError to 409', () => {
    const err = new CouchbaseNotReadyError('external_api');
    expect(couchbaseConsumerHttpResponse(err, 'message')).toEqual({
      status: 409,
      body: { message: err.message },
    });
    expect(couchbaseConsumerHttpResponse(err, 'error')).toEqual({
      status: 409,
      body: { error: err.message },
    });
  });

  it('maps CouchbaseUnsupportedError to 422', () => {
    const err = new CouchbaseUnsupportedError('multiSeries');
    expect(couchbaseConsumerHttpResponse(err, 'error')).toEqual({
      status: 422,
      body: { error: err.message },
    });
  });

  it('maps CouchbaseQueryError to its httpStatus', () => {
    const err = new CouchbaseQueryError(
      'PERMISSION_DENIED',
      'denied',
      'SELECT 1',
    );
    const mapped = couchbaseConsumerHttpResponse(err, 'message');
    expect(mapped?.status).toBe(err.httpStatus);
    expect(mapped?.body).toEqual({ message: 'denied' });
  });

  it('returns null for unrelated errors', () => {
    expect(
      couchbaseConsumerHttpResponse(new Error('nope'), 'message'),
    ).toBeNull();
  });
});

describe('couchbaseConsumerMcpError', () => {
  it('maps CouchbaseNotReadyError to a tool error', () => {
    const err = new CouchbaseNotReadyError('mcp');
    const mapped = couchbaseConsumerMcpError(err);
    expect(mapped?.isError).toBe(true);
    expect(mapped?.content[0].text).toBe(err.message);
  });

  it('adds SQL++ hint on parse errors', () => {
    const err = new CouchbaseQueryError(
      'PARSING_FAILED',
      'syntax error',
      'SELECT',
    );
    const mapped = couchbaseConsumerMcpError(err);
    expect(mapped?.content[0].text).toContain('This source uses SQL++.');
  });
});
