import { CouchbaseQueryError } from '@/couchbase/errors';
import { declaredColumns } from '@/couchbase/otelSchema';
import type { Keyspace } from '@/couchbase/types';
import type { ColumnMeta } from '@/query/types';

type ColumnSource = {
  getColumns(args: {
    connectionId: string;
    databaseName: string;
    scopeName?: string;
    tableName: string;
  }): Promise<ColumnMeta[]>;
  listKeyspaces(args: { connectionId: string }): Promise<Keyspace[]>;
};

/**
 * Where the columns came from: inferred from documents, declared (an empty
 * OTel collection), empty (an empty collection with no declared schema), or
 * missing (no such collection).
 */
export type ColumnOrigin = 'inferred' | 'declared' | 'empty' | 'missing';

/**
 * Columns for the describe tools. INFER cannot read an empty collection, so an
 * existing empty OTel collection reports its declared schema, as upstream
 * DESCRIBE TABLE does for a table with zero rows (Q25). The metric discovery
 * tools use it too, so an empty kind collection keeps the "no data" hint.
 */
export async function describeColumns(
  metadata: ColumnSource,
  args: {
    connectionId: string;
    databaseName: string;
    scopeName?: string;
    tableName: string;
  },
): Promise<{ columns: ColumnMeta[]; origin: ColumnOrigin }> {
  let columns: ColumnMeta[];
  try {
    columns = await metadata.getColumns(args);
  } catch (e) {
    if (e instanceof CouchbaseQueryError && e.code === 'KEYSPACE_NOT_FOUND') {
      return { columns: [], origin: 'missing' };
    }
    throw e;
  }
  if (columns.length > 0) return { columns, origin: 'inferred' };

  const scope = args.scopeName || 'default';
  const spaces = await metadata.listKeyspaces({
    connectionId: args.connectionId,
  });
  const exists = spaces.some(
    k =>
      k.bucket === args.databaseName &&
      k.scope === scope &&
      k.collection === args.tableName,
  );
  if (!exists) return { columns: [], origin: 'missing' };
  const declared = declaredColumns(args.tableName);
  return declared
    ? { columns: declared, origin: 'declared' }
    : { columns: [], origin: 'empty' };
}
