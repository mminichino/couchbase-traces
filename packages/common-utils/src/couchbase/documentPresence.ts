import { CouchbaseQueryError } from '@/couchbase/errors';
import { keyspaceList } from '@/couchbase/metadataSql';
import { unwrapRawRow } from '@/couchbase/rawRow';
import { type SqlPP, sqlpp } from '@/couchbase/sqlpp';
import type { Keyspace } from '@/couchbase/types';

/** Bucket/scope/collection as sources store them (`from`). */
export type SourceKeyspace = {
  databaseName: string;
  scopeName?: string;
  tableName: string;
};

/** The slice of a data client this module needs. */
type QueryClient = {
  query(inputs: {
    query: string;
    query_params?: Record<string, unknown>;
    connectionId: string;
    format: 'JSON';
  }): Promise<{ json(): Promise<{ data: unknown[] }> }>;
};

const DEFAULT_SCOPE = 'default';

/**
 * COUNT(*) with no predicate is answered from collection statistics, so it
 * needs no index and scans nothing (upstream read `system.tables.total_rows`).
 */
export function documentCountStatement(ks: Keyspace): SqlPP {
  return sqlpp`SELECT RAW COUNT(*) FROM ${{ Keyspace: ks }}`;
}

const keyOf = (k: Keyspace) =>
  `${k.bucket}\u0000${k.scope}\u0000${k.collection}`;

async function rows(
  client: QueryClient,
  connectionId: string,
  q: SqlPP,
): Promise<unknown[]> {
  const result = await client.query({
    query: q.statement,
    query_params: q.parameters,
    connectionId,
    format: 'JSON',
  });
  return (await result.json()).data.map(unwrapRawRow);
}

/**
 * True when at least one of the given collections holds a document. Collections
 * that do not exist count as empty (a source may point at one ingest has not
 * created yet); other query errors propagate.
 */
export async function hasDocuments(
  client: QueryClient,
  args: { connectionId: string; keyspaces: SourceKeyspace[] },
): Promise<boolean> {
  const wanted = new Map<string, Keyspace>();
  for (const s of args.keyspaces) {
    const ks = {
      bucket: s.databaseName,
      scope: s.scopeName || DEFAULT_SCOPE,
      collection: s.tableName,
    };
    wanted.set(keyOf(ks), ks);
  }
  if (wanted.size === 0) return false;

  const listed = await rows(client, args.connectionId, keyspaceList());
  const existing = new Set(
    listed
      .filter((r): r is unknown[] => Array.isArray(r) && r.length === 3)
      .map(([bucket, scope, collection]) =>
        keyOf({
          bucket: String(bucket),
          scope: String(scope),
          collection: String(collection),
        }),
      ),
  );

  for (const [key, ks] of wanted) {
    if (!existing.has(key)) continue;
    try {
      const [count] = await rows(
        client,
        args.connectionId,
        documentCountStatement(ks),
      );
      if (Number(count) > 0) return true;
    } catch (err) {
      // Dropped between the listing and the count.
      if (
        err instanceof CouchbaseQueryError &&
        err.code === 'KEYSPACE_NOT_FOUND'
      )
        continue;
      throw err;
    }
  }
  return false;
}
