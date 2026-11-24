import { SourceKind } from '@couchbase-traces/common-utils/dist/types';

import { getSources } from '@/controllers/sources';
import type { DataClient } from '@/query';
import logger from '@/utils/logger';

export type CollectionRef = {
  bucket: string;
  scope: string;
  collection: string;
};

type QueryCtx = {
  dataClient: DataClient;
  connectionId: string;
  signal: AbortSignal;
};

export type CollectionIndex = {
  name: string;
  type: string;
  expression: string;
  condition?: string;
  /** Only when the index is not online yet (deferred, building). */
  state?: string;
};

export type MatchingSource = { id: string; name: string; kind: SourceKind };

/**
 * Sources on this connection that read the collection, so callers can be sent
 * to cbt_describe_source (upstream findSourcesForTable). A metric source
 * matches through any of its kind collections.
 */
export async function findSourcesForCollection(args: {
  teamId: string;
  connectionId: string;
  ref: CollectionRef;
}): Promise<MatchingSource[]> {
  try {
    const sources = await getSources(args.teamId);
    return sources
      .filter(
        s =>
          s.kind !== SourceKind.Promql &&
          s.connection.toString() === args.connectionId &&
          s.from?.databaseName === args.ref.bucket &&
          (s.from?.scopeName || 'default') === args.ref.scope &&
          (s.from?.tableName === args.ref.collection ||
            ('metricTables' in s &&
              Object.values(s.metricTables ?? {}).includes(
                args.ref.collection,
              ))),
      )
      .map(s => ({ id: s._id.toString(), name: s.name, kind: s.kind }));
  } catch (e) {
    // The columns are still worth returning without the source hint.
    logger.warn(
      { err: e, teamId: args.teamId, connectionId: args.connectionId },
      'cbt_describe_table source lookup failed',
    );
    return [];
  }
}

type IndexRow = {
  name: string;
  using?: string;
  index_key?: string[];
  condition?: string;
  is_primary?: boolean;
  state?: string;
};

/**
 * Online and pending GSI and primary indexes on the collection, read from
 * system:indexes on every call so a new index shows at once. Upstream lists
 * data-skipping indices; a GSI index is the SQL++ equivalent.
 */
export async function collectionIndexes(
  ctx: QueryCtx,
  ref: CollectionRef,
): Promise<CollectionIndex[]> {
  const response = await ctx.dataClient.query({
    query:
      'SELECT i.name, i.`using`, i.index_key, i.`condition`, i.is_primary, i.state ' +
      'FROM system:indexes AS i ' +
      'WHERE i.bucket_id = $bucket AND i.scope_id = $scope ' +
      'AND i.keyspace_id = $collection ORDER BY i.name',
    query_params: {
      bucket: ref.bucket,
      scope: ref.scope,
      collection: ref.collection,
    },
    format: 'JSON',
    connectionId: ctx.connectionId,
    abort_signal: ctx.signal,
  });
  const { data } = (await response.json()) as { data: IndexRow[] };
  return data.map(row => ({
    name: row.name,
    type: row.is_primary ? 'primary' : (row.using ?? 'gsi'),
    expression: (row.index_key ?? []).join(', '),
    ...(row.condition && { condition: row.condition }),
    ...(row.state && row.state !== 'online' && { state: row.state }),
  }));
}

/**
 * WHERE clause that lets the sample read through an index. Without a primary
 * index a bare `LIMIT n` needs a sequential scan, which the least-privileged
 * query user (no query_use_sequential_scans) is refused on every OTel
 * collection. Any online, unconditional GSI index whose leading key is a plain
 * field path answers `<key> IS NOT MISSING`; array and function keys are
 * skipped.
 */
export function sampleFilter(indexes: CollectionIndex[]): string {
  const online = indexes.filter(i => i.state == null && !i.condition);
  if (online.some(i => i.type === 'primary')) return '';
  for (const index of online) {
    if (index.type !== 'gsi') continue;
    const leading = index.expression
      .split(', ')[0]
      ?.replace(/\s+(ASC|DESC)$/i, '')
      .trim();
    if (!leading || !/^[`\w.]+$/.test(leading)) continue;
    return ` WHERE (${leading}) IS NOT MISSING`;
  }
  return '';
}

/**
 * Document count of the collection. COUNT(*) without a predicate reads the
 * collection's item count, so it needs no index and scans nothing.
 */
export async function approxDocumentCount(
  ctx: QueryCtx,
  keyspace: string,
): Promise<number> {
  const response = await ctx.dataClient.query({
    query: `SELECT COUNT(*) AS n FROM ${keyspace}`,
    format: 'JSON',
    connectionId: ctx.connectionId,
    abort_signal: ctx.signal,
  });
  const { data } = (await response.json()) as {
    data: { n: number | string }[];
  };
  // Q24: integers arrive as strings at the data-client level.
  return Number(data[0]?.n ?? 0);
}
