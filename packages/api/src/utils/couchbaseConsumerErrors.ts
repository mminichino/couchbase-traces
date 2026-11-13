import { CouchbaseQueryError } from '@couchbase-traces/common-utils/dist/couchbase/errors';
import {
  CouchbaseNotReadyError,
  CouchbaseUnsupportedError,
} from '@couchbase-traces/common-utils/dist/dataLayer';

export type ExternalApiErrorField = 'error' | 'message';

export function couchbaseConsumerHttpResponse(
  err: unknown,
  field: ExternalApiErrorField,
): { status: number; body: Record<ExternalApiErrorField, string> } | null {
  if (err instanceof CouchbaseNotReadyError) {
    return { status: 409, body: { [field]: err.message } };
  }
  if (err instanceof CouchbaseUnsupportedError) {
    return { status: 422, body: { [field]: err.message } };
  }
  if (err instanceof CouchbaseQueryError) {
    const safeMsg =
      (err.message.split('\n')[0] ?? '').slice(0, 300) || 'Query error';
    return { status: err.httpStatus, body: { [field]: safeMsg } };
  }
  return null;
}
