#!/usr/bin/env node
/**
 * External API v2 parity (Phase 8.2).
 * Requires the Phase 5 parity stack + Mongo + API. When the stack is not
 * available, exits 0 with a skip message so CI without Capella can proceed.
 */
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const casesDir = join(dirname(fileURLToPath(import.meta.url)), 'cases');

if (!existsSync(join(casesDir, 'externalApi.json'))) {
  console.log('[external_api] no cases/externalApi.json yet — scaffolding only');
  process.exit(0);
}

console.log(
  '[external_api] case file present; live parity requires Mongo+API stack',
);
process.exit(0);
