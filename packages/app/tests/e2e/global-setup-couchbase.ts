/**
 * Full-stack E2E setup with Couchbase telemetry store (Phase 7 search).
 */
import { execSync } from 'node:child_process';
import path from 'node:path';

import type { FullConfig } from '@playwright/test';

import { ensureE2eCustomServiceCollection, seedCouchbase } from './seed-couchbase';

const QUERY_URL =
  process.env.COUCHBASE_URL?.replace(/\/$/, '') ??
  `http://127.0.0.1:${process.env.CBT_E2E_CB_QUERY_PORT ?? '28291'}`;
const MGMT_PORT = process.env.CBT_E2E_CB_MGMT_PORT ?? '28091';
const KV_HOST = process.env.CBT_E2E_CB_HOST ?? '127.0.0.1';

const repoRoot = path.join(__dirname, '../../../..');

async function waitForCouchbase(): Promise<void> {
  console.log(`Waiting for Couchbase at ${QUERY_URL}...`);
  for (let attempt = 1; attempt <= 90; attempt++) {
    try {
      const res = await fetch(`${QUERY_URL}/pools`);
      if (res.ok) {
        console.log('  ✓ Couchbase is ready');
        return;
      }
    } catch {
      // retry
    }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Couchbase did not become ready in time');
}

function runIngestSetup(): void {
  console.log('Running ingest setup (bucket, users, indexes)...');
  execSync(
    'node .yarn/releases/yarn-4.13.0.cjs workspace @couchbase-traces/ingest build',
    { cwd: repoRoot, stdio: 'inherit' },
  );
  const setupEnv = {
    ...process.env,
    CBT_COUCHBASE_CONNSTR: `couchbase://${KV_HOST}`,
    CBT_COUCHBASE_BUCKET: 'otel',
    CBT_COUCHBASE_SCOPE: 'default',
    CBT_COUCHBASE_ADMIN_USER: process.env.COUCHBASE_USERNAME ?? 'Administrator',
    CBT_COUCHBASE_ADMIN_PASSWORD:
      process.env.COUCHBASE_PASSWORD ?? 'cbt-test-admin',
    CBT_COUCHBASE_QUERY_USER: 'cbt_otel_query',
    CBT_COUCHBASE_QUERY_PASSWORD: 'cbt-otel-query-password',
    CBT_COUCHBASE_INGEST_USER: 'cbt_otel_ingest',
    CBT_COUCHBASE_INGEST_PASSWORD: 'cbt-otel-ingest-password',
    CBT_COUCHBASE_MONITOR_USER: 'cbt_otel_monitor',
    CBT_COUCHBASE_MONITOR_PASSWORD: 'cbt-otel-monitor-password',
    CBT_COUCHBASE_MGMT_PORT: MGMT_PORT,
    CBT_COUCHBASE_NETWORK: 'external',
  };
  execSync(
    'node packages/ingest/dist/setup/cli.js --create-bucket --create-users --bucket-ram-mb 1024 --index-replicas 0',
    { cwd: repoRoot, env: setupEnv, stdio: 'inherit' },
  );
}

export default async function globalSetupCouchbase(config: FullConfig) {
  process.env.CBT_E2E_STORE = 'couchbase';
  await waitForCouchbase();
  runIngestSetup();
  await seedCouchbase();
  const { default: fullstackSetup } = await import('./global-setup-fullstack');
  await fullstackSetup(config);
}
