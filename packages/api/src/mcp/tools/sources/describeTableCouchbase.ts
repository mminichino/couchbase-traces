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
    query:
      "SELECT RAW [k.`bucket`, k.`scope`, k.`name`] FROM system:all_keyspaces AS k WHERE k.`namespace` = 'default' AND k.`scope` IS VALUED AND k.`scope` != '_system'",
    format: 'JSON',
    connectionId: ctx.connectionId,
    abort_signal: ctx.signal,
  });
  const rows = (await response.json()) as { data: [string, string, string][] };
  const collections = rows.data
    .filter(row => row[0] === bucket)
    .map(row => ({ scope: row[1], collection: row[2] }))
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
  let sampleRows: Record<string, unknown>[] | undefined;
  if (input.sampleRows > 0) {
    const sample = await ctx.dataClient.query({
      query: `SELECT META().id AS __cbt_id, d.* FROM ${qualified} AS d LIMIT ${input.sampleRows}`,
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
            },
            columns: columns.map(c => ({
              name: c.name,
              type: c.type,
              jsType: columnTypeToJSType(c.type),
            })),
            ...(emptyNote && { note: emptyNote }),
            ...(sampleRows && { sampleRows }),
            exampleQueries: {
              browse: `SELECT d.* FROM ${qualified} AS d LIMIT 20`,
              count: `SELECT COUNT(*) AS n FROM ${qualified} AS d LIMIT 1`,
            },
            nextSteps: {
              query: `Query with cbt_sql using connectionId "${ctx.connectionId}" and SQL++ against ${qualified}.`,
            },
          },
          null,
          2,
        ),
      },
    ],
  };
}
