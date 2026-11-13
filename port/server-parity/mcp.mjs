#!/usr/bin/env node
/**
 * MCP query-tool parity (Phase 8.3).
 * Requires the Phase 5 parity stack, Mongo, and API with MCP enabled.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const casesDir = join(dirname(fileURLToPath(import.meta.url)), 'cases');

if (!existsSync(join(casesDir, 'mcp.json'))) {
  console.log('[mcp] no cases/mcp.json yet — scaffolding only');
  process.exit(0);
}

console.log('[mcp] case file present; live parity requires API+MCP stack');
process.exit(0);
