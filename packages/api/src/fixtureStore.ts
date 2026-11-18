/**
 * CI fixture store client: ClickHouse-shaped helpers (ping / command / insert /
 * query) backed by the Couchbase query HTTP API so packages/api int tests keep
 * working after the DataClient ClickHouse surface was removed.
 *
 * Uses `globalThis.realFetch` when present — jest.setup.ts mocks `global.fetch`
 * to a stub that returns `{}`, which would make every fixture query look like a
 * silent failure.
 */
import { createHash, randomUUID } from 'node:crypto';

const BUCKET = process.env.CBT_COUCHBASE_BUCKET || 'otel';
const SCOPE = process.env.CBT_COUCHBASE_SCOPE || 'default';
const ADMIN_USER =
  process.env.CBT_COUCHBASE_ADMIN_USER ||
  process.env.CBT_TEST_COUCHBASE_ADMIN_USER ||
  'Administrator';
const ADMIN_PASSWORD =
  process.env.CBT_COUCHBASE_ADMIN_PASSWORD ||
  process.env.CBT_TEST_COUCHBASE_ADMIN_PASSWORD ||
  'dev-admin-password';
const QUERY_PORT = Number(
  process.env.CBT_CI_CB_QUERY_PORT ||
    process.env.CBT_COUCHBASE_QUERY_PORT ||
    8093,
);

type RealFetchHolder = { realFetch?: typeof fetch };

function liveFetch(): typeof fetch {
  const fromSetup = (globalThis as RealFetchHolder).realFetch;
  if (typeof fromSetup === 'function') {
    return fromSetup.bind(globalThis);
  }
  return globalThis.fetch.bind(globalThis);
}

function quoteIdent(name: string): string {
  if (name.includes('`')) {
    throw new Error(`identifier must not contain backticks: ${name}`);
  }
  return `\`${name}\``;
}

function parseTableRef(table: string): {
  bucket: string;
  scope: string;
  collection: string;
} {
  // Legacy "database.table" → scope.collection in the otel bucket.
  const parts = table.split('.').filter(Boolean);
  if (parts.length === 1) {
    return { bucket: BUCKET, scope: SCOPE, collection: parts[0] };
  }
  if (parts.length === 2) {
    return { bucket: BUCKET, scope: parts[0], collection: parts[1] };
  }
  return {
    bucket: parts[0],
    scope: parts[1],
    collection: parts.slice(2).join('.'),
  };
}

function keyspace(table: string): string {
  const { bucket, scope, collection } = parseTableRef(table);
  return `${quoteIdent(bucket)}.${quoteIdent(scope)}.${quoteIdent(collection)}`;
}

function translateCommand(sql: string): string {
  const trimmed = sql.trim();
  const truncate = trimmed.match(
    /^TRUNCATE(?:\s+TABLE)?\s+([`\w.]+)\s*;?\s*$/i,
  );
  if (truncate) {
    const ref = truncate[1].replace(/`/g, '');
    return `DELETE FROM ${keyspace(ref)}`;
  }
  const drop = trimmed.match(
    /^DROP\s+TABLE\s+IF\s+EXISTS\s+([`\w.]+)\s*;?\s*$/i,
  );
  if (drop) {
    // No-op for Couchbase collections in fixtures; schema is managed by ingest setup.
    return 'SELECT RAW 1';
  }
  // Rewrite bare `default.otel_*` refs in other DDL/DML to full keyspaces when
  // they appear as a single table token after FROM/INTO/TABLE.
  return trimmed.replace(
    /\b(FROM|INTO|TABLE|UPDATE)\s+(`?default`?\.`?[A-Za-z0-9_]+`?)/gi,
    (_m, kw: string, ref: string) => `${kw} ${keyspace(ref.replace(/`/g, ''))}`,
  );
}

type QueryBody = {
  status?: string;
  results?: unknown[];
  errors?: unknown;
};

async function queryHttp(
  statement: string,
  named?: Record<string, unknown>,
): Promise<QueryBody> {
  if (!Number.isFinite(QUERY_PORT) || QUERY_PORT <= 0) {
    throw new Error(`invalid Couchbase query port: ${QUERY_PORT}`);
  }
  const payload: Record<string, unknown> = {
    statement,
    timeout: '60s',
  };
  if (named) {
    for (const [k, v] of Object.entries(named)) {
      payload[`$${k}`] = v;
    }
  }
  const auth = Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`).toString(
    'base64',
  );
  const url = `http://127.0.0.1:${QUERY_PORT}/query/service`;
  const res = await liveFetch()(url, {
    method: 'POST',
    headers: {
      authorization: `Basic ${auth}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  let body: QueryBody;
  try {
    body = text ? (JSON.parse(text) as QueryBody) : {};
  } catch {
    throw new Error(
      `fixture query non-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`,
    );
  }
  if (!res.ok || body.status !== 'success') {
    throw new Error(
      `fixture query failed (HTTP ${res.status}): ${JSON.stringify(
        body.errors || body,
      )}`,
    );
  }
  return body;
}

export class FixtureDataClient {
  async ping(): Promise<{ success: true } | { success: false; error: Error }> {
    try {
      await queryHttp('SELECT RAW 1');
      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err : new Error(String(err)),
      };
    }
  }

  async command(opts: { query: string }): Promise<void> {
    await queryHttp(translateCommand(opts.query));
  }

  async insert(opts: {
    table: string;
    values: Record<string, unknown>[];
    format?: string;
  }): Promise<void> {
    const ks = keyspace(opts.table.replace(/`/g, ''));
    for (const row of opts.values) {
      const id =
        typeof row.id === 'string'
          ? row.id
          : createHash('sha256')
              .update(randomUUID())
              .digest('hex')
              .slice(0, 32);
      // Dates → ISO strings for SQL++ JSON params.
      const value = JSON.parse(
        JSON.stringify(row, (_k, v) =>
          v instanceof Date ? v.toISOString() : v,
        ),
      );
      // Same shape as packages/common-utils couchbase int helpers.
      await queryHttp(`UPSERT INTO ${ks} (KEY, VALUE) VALUES ($k, $v)`, {
        k: id,
        v: value,
      });
    }
  }

  async query(opts: {
    query: string;
    format?: string;
    query_params?: Record<string, unknown>;
  }): Promise<{ json: () => Promise<any> }> {
    // Legacy waitForFixtureSchema probed system.tables; map that to keyspaces.
    if (/system\.tables/i.test(opts.query)) {
      const body = await queryHttp(
        `SELECT RAW c.name FROM system:keyspaces AS c
         WHERE c.\`bucket\` = $bucket AND c.\`scope\` = $scope`,
        { bucket: BUCKET, scope: SCOPE },
      );
      const names = (body.results ?? []).map((name: unknown) => ({
        name: String(name),
      }));
      return { json: async () => names };
    }
    // ClickHouse-only probes (query_log / SYSTEM FLUSH) — empty result so
    // attribution int tests that still call them do not crash the suite setup.
    if (/system\.query_log|SYSTEM\s+FLUSH/i.test(opts.query)) {
      if ((opts.format || '').toUpperCase() === 'JSON') {
        return { json: async () => ({ data: [] }) };
      }
      return { json: async () => [] };
    }
    const translated = translateCommand(opts.query);
    const body = await queryHttp(translated, opts.query_params);
    const rows = (body.results ?? []) as unknown[];
    if ((opts.format || '').toUpperCase() === 'JSON') {
      return { json: async () => ({ data: rows }) };
    }
    return { json: async () => rows };
  }

  async close(): Promise<void> {
    // Stateless HTTP client — nothing to close.
  }
}
