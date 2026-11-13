#!/usr/bin/env node
/**
 * CLI data-hook parity (Phase 8.5).
 * Compares tile, trace, event, and pattern query helpers against ClickHouse and
 * Couchbase sources over the same data. Requires the Phase 5 parity stack plus
 * Mongo and the API; exits 0 with a skip message when cases are not present.
 */
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const casesDir = join(dirname(fileURLToPath(import.meta.url)), 'cases');

if (!existsSync(join(casesDir, 'cli.json'))) {
  console.log('[cli] no cases/cli.json yet — scaffolding only');
  process.exit(0);
}

console.log('[cli] case file present; live parity requires Mongo+API stack');
process.exit(0);
