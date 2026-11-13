import { CouchbaseQueryError } from '@couchbase-traces/common-utils/dist/couchbase/errors';
import {
  CouchbaseNotReadyError,
  CouchbaseUnsupportedError,
} from '@couchbase-traces/common-utils/dist/dataLayer';

import { couchbaseConsumerHttpResponse } from '@/utils/couchbaseConsumerErrors';

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
    const err = new CouchbaseQueryError('PERMISSION_DENIED', 'denied', 'SELECT 1');
    const mapped = couchbaseConsumerHttpResponse(err, 'message');
    expect(mapped?.status).toBe(err.httpStatus);
    expect(mapped?.body).toEqual({ message: 'denied' });
  });

  it('returns null for unrelated errors', () => {
    expect(couchbaseConsumerHttpResponse(new Error('nope'), 'message')).toBeNull();
  });
});
