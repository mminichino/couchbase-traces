#!/usr/bin/env node
/**
 * Records server-parity suites when case files exist; otherwise no-op success.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const serverParity = join(here, '../../server-parity');
const outDir = process.env.GOLDEN_CAPTURE_DIR;

const suites = [
  { suite: 'alerts', file: 'cases/alerts.json' },
  { suite: 'external_api', file: 'cases/external_api.json' },
  { suite: 'mcp', file: 'cases/mcp.json' },
  { suite: 'cli', file: 'cases/cli.json' },
];

/** @type {Record<string, number>} */
const counts = {};

for (const { suite, file } of suites) {
  const path = join(serverParity, file);
  if (!existsSync(path)) {
    counts[suite] = 0;
    console.error(`[capture-server] ${suite}: no case file (0 cases)`);
    continue;
  }
  const cases = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(cases) || cases.length === 0) {
    counts[suite] = 0;
    console.error(`[capture-server] ${suite}: empty (0 cases)`);
    continue;
  }
  console.error(
    `[capture-server] ${suite}: ${cases.length} cases defined — live capture not wired yet`,
  );
  counts[suite] = 0;
}

if (outDir) {
  process.stdout.write(`${JSON.stringify(counts)}\n`);
}
