import {
  type ColumnOrigin,
  describeColumns,
} from '@couchbase-traces/common-utils/dist/couchbase/describeColumns';
import { keyspace } from '@couchbase-traces/common-utils/dist/couchbase/sqlpp';
import { getMetadata } from '@couchbase-traces/common-utils/dist/dataLayer';
import { columnTypeToJSType } from '@couchbase-traces/common-utils/dist/query';

import type { ToolResult } from '@/mcp/tools/types';
import { mcpUserError } from '@/mcp/utils/errors';
import type { DataClient } from '@/query';

import {
  approxDocumentCount,
  collectionIndexes,
  findSourcesForCollection,
  sampleFilter,
} from './describeTableDetails';
import {
  decodeTableListCursor,
  type DescribeTableInput,
  encodeTableListCursor,
} from './describeTableSchema';

const DEFAULT_SCOPE = 'default';

function emptyNoteFor(origin: ColumnOrigin): string | undefined {
  if (origin === 'declared') {
    return 'The collection has no documents yet. The columns are the declared OTel schema; describe it again after data arrives to see inferred columns.';
  }
  if (origin === 'empty') {
    return 'The collection has no documents yet, so it has no inferred columns. Describe it again after data arrives, or use the source expressions.';
  }
  return undefined;
}

type CouchTableCtx = {
  dataClient: DataClient;
  connectionId: string;
  signal: AbortSignal;
};

function parseCouchTable(table: string): { scope: string; collection: string } {
  const parts = table.split('.');
  if (parts.length === 2) {
    return { scope: parts[0]!, collection: parts[1]! };
  }
  return { scope: DEFAULT_SCOPE, collection: table };
}

function ks(bucket: string, scope: string, collection: string) {
  return keyspace({ bucket, scope, collection });
}

async function listKeyspaces(
  ctx: CouchTableCtx,
  bucket: string,
  afterName: string | undefined,
  limit: number,
): Promise<Array<{ scope: string; collection: string }>> {
  const response = await ctx.dataClient.query({
    // Object rows: the data client wraps a RAW scalar or array row as
    // { value }, so SELECT RAW [...] rows never matched the bucket.
    query:
      "SELECT k.`scope` AS `scope`, k.`name` AS `collection` FROM system:all_keyspaces AS k WHERE k.`namespace` = 'default' AND k.`bucket` = $bucket AND k.`scope` IS VALUED AND k.`scope` != '_system'",
    query_params: { bucket },
    format: 'JSON',
    connectionId: ctx.connectionId,
    abort_signal: ctx.signal,
  });
  const rows = (await response.json()) as {
    data: { scope: string; collection: string }[];
  };
  const collections = rows.data
    .map(row => ({ scope: row.scope, collection: row.collection }))
    .sort((a, b) =>
      `${a.scope}.${a.collection}`.localeCompare(`${b.scope}.${b.collection}`),
    );
  const start =
    afterName != null
      ? collections.findIndex(c => `${c.scope}.${c.collection}` > afterName)
      : 0;
  const slice = start < 0 ? [] : collections.slice(start, start + limit + 1);
  return slice;
}

export async function listCouchbaseTables(
  ctx: CouchTableCtx,
  input: DescribeTableInput,
): Promise<ToolResult> {
  const cursor = input.cursor ? decodeTableListCursor(input.cursor) : null;
  const afterName = cursor?.lastName;
  const rows = await listKeyspaces(ctx, input.database, afterName, input.limit);
  if (rows.length === 0 && afterName == null) {
    return mcpUserError(
      `Bucket "${input.database}" not found or has no collections visible to this connection's Couchbase user.`,
    );
  }
  const page = rows.slice(0, input.limit);
  const nextCursor =
    rows.length > input.limit
      ? encodeTableListCursor({
          lastName: `${page[page.length - 1]!.scope}.${page[page.length - 1]!.collection}`,
        })
      : undefined;

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            database: input.database,
            queryLanguage: 'sqlpp',
            tables: page.map(r => ({
              name:
                r.scope === DEFAULT_SCOPE
                  ? r.collection
                  : `${r.scope}.${r.collection}`,
              keyspace: ks(input.database, r.scope, r.collection),
            })),
            ...(nextCursor && { nextCursor }),
            nextSteps: {
              describe:
                'Pass table as the collection name (or scope.collection) with the same database (bucket) to describe columns.',
            },
          },
          null,
          2,
        ),
      },
    ],
  };
}

export async function describeCouchbaseTable(
  ctx: CouchTableCtx,
  input: DescribeTableInput & { table: string; teamId: string },
): Promise<ToolResult> {
  const { scope, collection } = parseCouchTable(input.table);
  const metadata = getMetadata(ctx.dataClient);
  const notFound = () =>
    mcpUserError(
      `Collection "${input.table}" not found in bucket "${input.database}".`,
    );
  const { columns, origin } = await describeColumns(metadata, {
    databaseName: input.database,
    scopeName: scope,
    tableName: collection,
    connectionId: ctx.connectionId,
  });
  if (origin === 'missing') return notFound();
  const emptyNote = emptyNoteFor(origin);

  const qualified = ks(input.database, scope, collection);
  const ref = { bucket: input.database, scope, collection };
  const [indexes, approxTotalRows, sources] = await Promise.all([
    collectionIndexes(ctx, ref),
    approxDocumentCount(ctx, qualified),
    findSourcesForCollection({
      teamId: input.teamId,
      connectionId: ctx.connectionId,
      ref,
    }),
  ]);
  let sampleRows: Record<string, unknown>[] | undefined;
  if (input.sampleRows > 0) {
    const sample = await ctx.dataClient.query({
      query: `SELECT META(d).id AS __cbt_id, d.* FROM ${qualified} AS d${sampleFilter(indexes)} LIMIT ${input.sampleRows}`,
      format: 'JSON',
      connectionId: ctx.connectionId,
      abort_signal: ctx.signal,
    });
    const json = (await sample.json()) as { data: Record<string, unknown>[] };
    sampleRows = json.data;
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            queryLanguage: 'sqlpp',
            table: {
              database: input.database,
              scope,
              name: collection,
              keyspace: qualified,
              approxTotalRows,
            },
            columns: columns.map(c => ({
              name: c.name,
              type: c.type,
              jsType: columnTypeToJSType(c.type),
            })),
            indexes,
            ...(emptyNote && { note: emptyNote }),
            ...(sources.length > 0 && { sources }),
            ...(sampleRows && { sampleRows }),
            exampleQueries: {
              browse: `SELECT d.* FROM ${qualified} AS d LIMIT 20`,
              count: `SELECT COUNT(*) AS n FROM ${qualified} AS d LIMIT 1`,
            },
            nextSteps:
              sources.length > 0
                ? {
                    describeSource:
                      `This collection backs ${sources.length === 1 ? 'a source' : 'sources'}. ` +
                      `Call cbt_describe_source with sourceId "${sources[0]!.id}" for attribute keys and sampled values, ` +
                      'then query it with the builder tools (cbt_table, cbt_timeseries, cbt_search) rather than cbt_sql.',
                  }
                : {
                    query:
                      `Query it with cbt_sql using connectionId "${ctx.connectionId}" and SQL++ against ${qualified}. ` +
                      'To query it with the builder tools, register it as a source with cbt_save_source.',
                  },
          },
          null,
          2,
        ),
      },
    ],
  };
}
