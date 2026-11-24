import {
  CouchbaseQueryError,
  CouchbaseUnsupportedError,
} from '@couchbase-traces/common-utils/dist/couchbase/errors';

import {
  couchbaseConsumerHttpResponse,
  couchbaseConsumerMcpError,
} from '@/utils/couchbaseConsumerErrors';

describe('couchbaseConsumerHttpResponse', () => {
  it('maps CouchbaseUnsupportedError to 409', () => {
    const err = new CouchbaseUnsupportedError('external_api');
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
  it('maps CouchbaseUnsupportedError to a tool error', () => {
    const err = new CouchbaseUnsupportedError('mcp');
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

  // Upstream's UNKNOWN_TABLE reads "doesn't exist"; callers match on that.
  it("says a missing keyspace doesn't exist", () => {
    const err = new CouchbaseQueryError(
      'KEYSPACE_NOT_FOUND',
      'Keyspace not found in CB datastore: default:otel.default.nope',
      'SELECT 1 FROM nope',
    );
    const text = couchbaseConsumerMcpError(err)?.content[0].text ?? '';
    expect(text).toMatch(/^Keyspace not found/);
    expect(text).toContain("The keyspace doesn't exist.");
  });
});
