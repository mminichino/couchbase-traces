#!/usr/bin/env node
// Provisions the app metadata bucket (cbt_meta) in the test cluster with the
// same shared code the ingest setup CLI and the API use. packages/api's
// .env.test turns the metadata store on, so every API suite run by run.sh
// needs it. Requires `make ci-build` (common-utils dist).
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const { connect } = require(require.resolve('couchbase', { paths: [root] }));
const {
  ensureMetadataKeyspace,
} = require(
  require.resolve(
    '@couchbase-traces/common-utils/dist/couchbase/nodeMetadataProvision',
    { paths: [root] },
  ),
);

const env = process.env;

async function main() {
  const cluster = await connect(
    env.CBT_TEST_COUCHBASE_CONNSTR || 'couchbase://localhost',
    {
      username: env.CBT_TEST_COUCHBASE_ADMIN_USER || 'Administrator',
      password: env.CBT_TEST_COUCHBASE_ADMIN_PASSWORD || 'cbt-test-admin',
    },
  );
  try {
    const result = await ensureMetadataKeyspace(cluster, {
      bucket: 'cbt_meta',
      scope: 'app',
      ramMb: 256,
      replicas: 0,
      indexReplicas: 0,
      createBucket: true,
      // Dev-only; must match packages/api/.env.test.
      user: {
        username: 'cbt_meta',
        password: 'dev-metadata-password',
        provisionRoles: false,
      },
      waitTimeoutS: 300,
      log: line => console.log(`[couchbase-test:metadata] ${line}`),
    });
    console.log(
      `[couchbase-test:metadata] created ${result.created.length} resources`,
    );
  } finally {
    await cluster.close();
  }
}

main().catch(err => {
  console.error('[couchbase-test:metadata]', err);
  process.exit(typeof err.exitCode === 'number' ? err.exitCode : 1);
});
