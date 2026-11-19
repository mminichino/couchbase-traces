/**
 * Global setup for local E2E mode (no full product stack).
 *
 * Seeds Couchbase telemetry only.
 */

import { FullConfig } from '@playwright/test';

import { seedCouchbase } from './seed-couchbase';

async function globalSetupLocal(_config: FullConfig): Promise<void> {
  console.log('Setting up local E2E environment (seeding Couchbase)');
  process.env.TZ = 'America/New_York';

  await seedCouchbase();

  console.log('Local E2E setup complete');
}

export default globalSetupLocal;
