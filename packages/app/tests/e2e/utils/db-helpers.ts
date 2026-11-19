/**
 * Direct Couchbase access helpers for full-stack E2E tests. Only usable in
 * full-stack mode (real Couchbase via docker-compose) — there is no database
 * in local mode, so callers must gate on `{ tag: ['@full-stack'] }`.
 *
 * The app metadata lives in the `cbt_meta` bucket (scope `app`), keyed by
 * document id. Writes go through the query service with the admin account, the
 * same one the E2E setup provisions the cluster with.
 */
import { fromShapedRow } from '../../../../ingest/src/model/fromShapedRow';

import { E2E_LOGS_TABLE } from './constants';

const META_BUCKET = 'cbt_meta';
const META_SCOPE = 'app';

/** Collections the E2E reset empties. `system` (schema marker) is kept. */
const RESET_COLLECTIONS = [
  'teams',
  'users',
  'team_invites',
  'connections',
  'sources',
  'saved_searches',
  'dashboards',
  'alerts',
  'alert_history',
  'webhooks',
  'favorites',
  'pinned_filters',
  'preset_dashboard_filters',
  'unique_keys',
  'sessions',
] as const;

type MetaCollection = (typeof RESET_COLLECTIONS)[number];

const IDENT = /^[A-Za-z0-9_]+$/;

/** Backtick-quote a SQL++ identifier; rejects anything outside [A-Za-z0-9_]. */
function ident(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Invalid identifier: ${name}`);
  return `\`${name}\``;
}

function metaKeyspace(collection: MetaCollection): string {
  return `${ident(META_BUCKET)}.${ident(META_SCOPE)}.${ident(collection)}`;
}

const QUERY_URL =
  process.env.COUCHBASE_URL?.replace(/\/$/, '') ??
  `http://127.0.0.1:${process.env.CBT_E2E_CB_QUERY_PORT ?? '28093'}`;

function couchbaseAuthHeader(): string {
  const user = process.env.COUCHBASE_USERNAME ?? 'Administrator';
  const pass = process.env.COUCHBASE_PASSWORD ?? 'cbt-test-admin';
  return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

type QueryResult = { results: unknown[]; mutationCount: number };

async function runCouchbaseQuery(
  statement: string,
  parameters?: Record<string, unknown>,
): Promise<QueryResult> {
  const args: Record<string, unknown> = {
    statement,
    scan_consistency: 'request_plus',
  };
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
  return {
    results: body.results ?? [],
    mutationCount: Number(body.metrics?.mutationCount ?? 0),
  };
}

async function runCouchbaseStatement(
  statement: string,
  parameters?: Record<string, unknown>,
): Promise<void> {
  await runCouchbaseQuery(statement, parameters);
}

/** Upsert one log document into the default E2E logs collection. */
export async function upsertE2eLogRow(
  row: Record<string, unknown>,
): Promise<void> {
  const doc = fromShapedRow(E2E_LOGS_TABLE, row, {
    collection: 'otel_logs',
  });
  await runCouchbaseStatement(
    `UPSERT INTO \`otel\`.\`default\`.\`${doc.collection}\` (KEY, VALUE) VALUES ($key, $value)`,
    { key: doc.key, value: doc.value },
  );
}

/**
 * Empties the app metadata collections for a fresh test run. The metadata
 * keyspace has no primary index, so one is created per collection for the
 * delete and dropped again.
 */
export async function clearMetadata(): Promise<void> {
  for (const name of RESET_COLLECTIONS) {
    const ks = metaKeyspace(name);
    const index = ident('ix_e2e_reset_primary');
    await runCouchbaseStatement(
      `CREATE PRIMARY INDEX ${index} IF NOT EXISTS ON ${ks}`,
    );
    try {
      await runCouchbaseStatement(`DELETE FROM ${ks}`);
    } finally {
      await runCouchbaseStatement(
        `DROP PRIMARY INDEX IF EXISTS ${index} ON ${ks}`,
      );
    }
  }
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
export async function setTeamFlag(
  flagName: string,
  value: boolean,
): Promise<void> {
  // `createdAt` is the leading key of ix_teams_created, so this scan needs no
  // primary index.
  await runCouchbaseStatement(
    `UPDATE ${metaKeyspace('teams')} AS t SET t.${ident(flagName)} = $value WHERE t.createdAt IS NOT MISSING`,
    { value },
  );
}

/**
 * Applies a SQL++ SET clause to one document by id and asserts it matched, so
 * a zero-match write cannot make a later assertion pass for the wrong reason.
 * `setClause` is trusted test code, never user input; values go in `params`.
 */
export async function updateMetadataDoc(
  collection: MetaCollection,
  id: string,
  setClause: string,
  params: Record<string, unknown> = {},
): Promise<void> {
  const { mutationCount } = await runCouchbaseQuery(
    `UPDATE ${metaKeyspace(collection)} AS d USE KEYS $id SET ${setClause}`,
    { ...params, id },
  );
  if (mutationCount !== 1) {
    throw new Error(
      `Expected to update 1 ${collection} document (${id}), updated ${mutationCount}`,
    );
  }
}

/** Replace an alert's recorded evaluation history with the given rows. */
export async function replaceAlertHistory(
  alertId: string,
  rows: Array<Record<string, unknown>>,
): Promise<void> {
  const ks = metaKeyspace('alert_history');
  await runCouchbaseStatement(`DELETE FROM ${ks} WHERE alert = $alert`, {
    alert: alertId,
  });
  for (const [i, row] of rows.entries()) {
    await runCouchbaseStatement(
      `INSERT INTO ${ks} (KEY, VALUE) VALUES ($key, $value)`,
      { key: `e2e::${alertId}::${i}`, value: { alert: alertId, ...row } },
    );
  }
}
