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

// Add any additional playwright arguments
playwrightCmd.push(...playwrightArgs);

// Set environment variables (Playwright and its webServer children inherit these)
const env = {
  ...process.env,
  ...(!useLocal && { E2E_FULLSTACK: 'true' }),
  ...(useDev && { E2E_USE_DEV: 'true' }),
};

env.COUCHBASE_URL =
  env.COUCHBASE_URL ??
  `http://127.0.0.1:${env.CBT_E2E_CB_QUERY_PORT ?? '28291'}`;
env.CBT_E2E_CB_MGMT_PORT = env.CBT_E2E_CB_MGMT_PORT ?? '28091';

// Full-stack: inject DEFAULT_CONNECTIONS/DEFAULT_SOURCES from fixture so the API gets them
if (!useLocal) {
  const fixturePath = path.join(
    __dirname,
    '../tests/e2e/fixtures/e2e-fixtures.json',
  );
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));

  const cbKvPort = env.CBT_E2E_CB_KV_PORT ?? '28791';
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
    const metricTables =
      src.kind === 'metric' && src.metricTables
        ? Object.fromEntries(
            Object.entries(src.metricTables).map(([k, v]) => [
              k,
              typeof v === 'string' && v.startsWith('e2e_')
                ? v
                : String(v).replace(/^e2e_/, ''),
            ]),
          )
        : src.metricTables;
    const isOtelLogs = collection === 'otel_logs';
    const isOtelTraces = collection === 'otel_traces';
    return {
      ...src,
      from: {
        databaseName: 'otel',
        scopeName: 'default',
        tableName: collection,
      },
      ...(metricTables ? { metricTables } : {}),
      ...(src.kind === 'log' && isOtelLogs
        ? { searchIndexName: 'fts_otel_logs' }
        : {}),
      ...(src.kind === 'trace' && isOtelTraces
        ? { searchIndexName: 'fts_otel_traces' }
        : {}),
    };
  });
  env.DEFAULT_CONNECTIONS = JSON.stringify(connections);
  env.DEFAULT_SOURCES = JSON.stringify(sources);
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