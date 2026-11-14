import { CouchbaseQueryError } from '@couchbase-traces/common-utils/dist/couchbase/errors';
import { QueryError } from '@couchbase-traces/common-utils/dist/query';

export type ChartQueryError = QueryError | CouchbaseQueryError | Error;

export function isChartQueryError(
  error: unknown,
): error is QueryError | CouchbaseQueryError {
  return error instanceof QueryError || error instanceof CouchbaseQueryError;
}

export function isQueryErrorWithSql(
  error: unknown,
): error is QueryError | CouchbaseQueryError {
  return isChartQueryError(error);
}
