#!/usr/bin/env node

/**
 * E2E Test Runner
 *
 * Usage:
 *   yarn test:e2e                    # Run all tests (full-stack mode, default)
 *   yarn test:e2e --local            # Run frontend-only tests
 *   yarn test:e2e --ui               # Open Playwright UI (full-stack)
 *   yarn test:e2e --ui --local       # Open UI (local mode)
 *   yarn test:e2e --debug            # Debug mode (full-stack)
 *   yarn test:e2e --debug --local    # Debug (local mode)
 *   yarn test:e2e --dev              # Hot reload (next dev) instead of build+start
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command line arguments
const args = process.argv.slice(2);
const useLocal = args.includes('--local');
const useUI = args.includes('--ui');
const useDebug = args.includes('--debug');
const useDev = args.includes('--dev');

// Remove our custom flags from args
const playwrightArgs = args.filter(
  arg => !['--local', '--ui', '--debug', '--dev'].includes(arg),
);

// Build playwright command
const playwrightCmd = ['playwright', 'test'];

// Add mode flags
if (useUI) {
  playwrightCmd.push('--ui');
}
if (useDebug) {
  playwrightCmd.push('--debug');
}

// Add grep-invert for local mode (exclude @full-stack tests)
if (useLocal) {
  playwrightCmd.push('--grep-invert', '@full-stack');
}
// The cluster spec runs in Phase 7's Couchbase e2e mode, not ClickHouse modes.
if (process.env.CBT_E2E_STORE !== 'couchbase') {
  playwrightCmd.push('--grep-invert', '@couchbase');
}

// Add any additional playwright arguments
playwrightCmd.push(...playwrightArgs);

// Set environment variables (Playwright and its webServer children inherit these)
const env = {
  ...process.env,
  ...(!useLocal && { E2E_FULLSTACK: 'true' }),
  ...(useDev && { E2E_USE_DEV: 'true' }),
};

// Port configuration from HDX_E2E_* env vars (set by scripts/test-e2e.sh)
const chPort = env.CBT_E2E_CH_PORT || '20500';

// Ensure CLICKHOUSE_HOST is set for seed-clickhouse.ts (used by both modes)
env.CLICKHOUSE_HOST = `http://localhost:${chPort}`;
if (env.CBT_E2E_STORE === 'couchbase') {
  env.COUCHBASE_URL =
    env.COUCHBASE_URL ?? `http://127.0.0.1:${env.CBT_E2E_CB_QUERY_PORT ?? '18093'}`;
  env.CBT_E2E_CB_MGMT_PORT = env.CBT_E2E_CB_MGMT_PORT ?? '18091';
}

// Full-stack: inject DEFAULT_CONNECTIONS/DEFAULT_SOURCES from fixture so the API gets them
if (!useLocal) {
  const fixturePath = path.join(
    __dirname,
    '../tests/e2e/fixtures/e2e-fixtures.json',
  );
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  if (env.CBT_E2E_STORE === 'couchbase') {
    const cbKvPort = env.CBT_E2E_CB_KV_PORT ?? '28123';
    // Remapped host ports require network=external (alternate-address in test-e2e.sh).
    const connections = [
      {
        id: 'local',
        name: 'local',
        kind: 'couchbase',
        host: `couchbase://127.0.0.1:${cbKvPort}?network=external`,
        username: 'Administrator',
        password: 'cbt-test-admin',
      },
    ];
    const tableToCollection = {
      e2e_otel_logs: 'otel_logs',
      e2e_otel_traces: 'otel_traces',
      e2e_custom_service_name: 'e2e_custom_service_name',
      e2e_hyperdx_sessions: 'hyperdx_sessions',
    };
    const sources = (fixture.sources ?? []).map(src => {
      const table = src.from?.tableName ?? '';
      const collection = tableToCollection[table] ?? table;
      return {
        ...src,
        from: {
          databaseName: 'otel',
          scopeName: 'default',
          tableName: collection,
        },
        ...(src.kind === 'log' && src.id === 'E2E Logs'
          ? { searchIndexName: 'fts_otel_logs' }
          : {}),
        ...(src.kind === 'trace' && src.id === 'E2E Traces'
          ? { searchIndexName: 'fts_otel_traces' }
          : {}),
      };
    });
    env.DEFAULT_CONNECTIONS = JSON.stringify(connections);
    env.DEFAULT_SOURCES = JSON.stringify(sources);
  } else {
    // Patch connection hosts with dynamic ClickHouse port
    const connections = (fixture.connections ?? []).map(conn => ({
      ...conn,
      host: conn.host?.replace(/localhost:\d+/, `localhost:${chPort}`),
    }));

    env.DEFAULT_CONNECTIONS = JSON.stringify(connections);
    env.DEFAULT_SOURCES = JSON.stringify(fixture.sources ?? []);
  }
}

// Run playwright
// eslint-disable-next-line no-console
console.info(`Running: ${playwrightCmd.join(' ')}`);
// eslint-disable-next-line no-console
console.info(
  `Mode: ${useLocal ? 'Local (frontend only)' : 'Full-stack'}${useDev ? ' + dev (hot reload)' : ''}`,
);

const child = spawn('npx', playwrightCmd, {
  stdio: 'inherit',
  shell: true,
  env,
  cwd: path.join(__dirname, '..'),
});

child.on('exit', code => {
  process.exit(code);
});
