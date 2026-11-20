// Couchbase telemetry cluster the API tests query (docker-compose.ci.yml).
// Values come from the CBT_COUCHBASE_* settings in .env.test and the CI job.
export const TEST_COUCHBASE_CONNECTION = {
  host: process.env.CBT_COUCHBASE_CONNSTR || 'couchbase://127.0.0.1',
  username: process.env.CBT_COUCHBASE_QUERY_USER || 'cbt_query',
  password: process.env.CBT_COUCHBASE_QUERY_PASSWORD || 'dev-query-password',
};
