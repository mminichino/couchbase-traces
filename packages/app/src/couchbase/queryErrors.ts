import { ClickHouseQueryError } from '@couchbase-traces/common-utils/dist/clickhouse';
import { CouchbaseQueryError } from '@couchbase-traces/common-utils/dist/couchbase/errors';

export type ChartQueryError =
  | ClickHouseQueryError
  | CouchbaseQueryError
  | Error;

export function isChartQueryError(
  error: unknown,
): error is ClickHouseQueryError | CouchbaseQueryError {
  return (
    error instanceof ClickHouseQueryError ||
    error instanceof CouchbaseQueryError
  );
}

export function isQueryErrorWithSql(
  error: unknown,
): error is ClickHouseQueryError | CouchbaseQueryError {
  return isChartQueryError(error);
}
