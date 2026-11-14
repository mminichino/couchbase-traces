/**
 * Direct MongoDB and Couchbase access helpers for full-stack E2E tests. Only
 * usable in full-stack mode (real Mongo and Couchbase via docker-compose) — there
 * is no database in local mode, so callers must gate on `{ tag: ['@full-stack'] }`.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

import { fromClickHouseRow } from '../../../../ingest/src/model/fromClickHouseRow';

import { E2E_LOGS_TABLE } from './constants';

/**
 * Run a mongosh script against the e2e MongoDB container by piping the script
 * through stdin. Using stdin (rather than `--eval "<...>"`) avoids having to
 * escape quotes in the script body, so callers can pass multi-line JavaScript
 * with string literals verbatim.
 *
 * `execFileSync` with an argument array rather than a shell string: the project
 * slug comes from an env var, and with no shell nothing in it can be read as a
 * metacharacter.
 *
 * Throws if the docker-compose file can't be found (meaning we're not running
 * in the expected Docker-backed e2e environment).
 */
export function runMongoshScript(script: string): string {
  const dockerComposeFile = path.join(__dirname, '..', 'docker-compose.yml');
  if (!fs.existsSync(dockerComposeFile)) {
    throw new Error(
      `docker-compose.yml not found at ${dockerComposeFile} — e2e Docker stack unavailable`,
    );
  }

  const e2eSlot = process.env.CBT_E2E_SLOT || '0';

  return execFileSync(
    'docker',
    [
      'compose',
      '-p',
      `e2e-${e2eSlot}`,
      '-f',
      dockerComposeFile,
      'exec',
      '-T',
      'db',
      'mongosh',
      '--quiet',
    ],
    {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      input: script,
    },
  );
}

/**
 * Sets a boolean field directly on the (single, seeded) e2e team document.
 * There's no settings UI or API endpoint for team feature flags yet, so
 * direct DB writes are the only way to toggle them for a test.
 *
 * This app only ever has one team per deployment (`/register/password`
 * 409s with `teamAlreadyExists` once any team exists — see
 * `isTeamExisting` in packages/api/src/controllers/team.ts), so there's
 * nothing to scope by. Tests that toggle a flag here should still avoid
 * racing each other — e.g. via `test.describe.serial(...)` — since
 * `fullyParallel: true` lets tests in the same file run concurrently.
 */
export function setTeamFlag(flagName: string, value: boolean): void {
  runMongoshScript(`
use('hyperdx-e2e');
db.teams.updateOne({}, { $set: { [${JSON.stringify(flagName)}]: ${JSON.stringify(value)} } });
`);
}

const QUERY_URL =
  process.env.COUCHBASE_URL?.replace(/\/$/, '') ??
  `http://127.0.0.1:${process.env.CBT_E2E_CB_QUERY_PORT ?? '28093'}`;

function couchbaseAuthHeader(): string {
  const user = process.env.COUCHBASE_USERNAME ?? 'Administrator';
  const pass = process.env.COUCHBASE_PASSWORD ?? 'cbt-test-admin';
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

async function runCouchbaseStatement(
  statement: string,
  parameters?: Record<string, unknown>,
): Promise<void> {
  const args: Record<string, unknown> = { statement };
  if (parameters) {
    for (const [k, v] of Object.entries(parameters)) {
      args[`$${k}`] = v;
    }
  }
  const res = await fetch(`${QUERY_URL}/query/service`, {
    method: 'POST',
    headers: {
      authorization: couchbaseAuthHeader(),
      'content-type': 'application/json',
    },
    body: JSON.stringify(args),
  });
  const body = await res.json();
  if (body.status !== 'success') {
    throw new Error(JSON.stringify(body.errors ?? body));
  }
}

/** Upsert one log document into the default E2E logs collection. */
export async function upsertE2eLogRow(
  row: Record<string, unknown>,
): Promise<void> {
  const doc = fromClickHouseRow(E2E_LOGS_TABLE, row, {
    collection: 'otel_logs',
  });
  await runCouchbaseStatement(
    `UPSERT INTO \`otel\`.\`default\`.\`${doc.collection}\` (KEY, VALUE) VALUES ($key, $value)`,
    { key: doc.key, value: doc.value },
  );
}
