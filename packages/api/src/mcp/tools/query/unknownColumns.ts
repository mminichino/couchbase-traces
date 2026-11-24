import { describeColumns } from '@couchbase-traces/common-utils/dist/couchbase/describeColumns';
import { fieldReferences } from '@couchbase-traces/common-utils/dist/couchbase/fieldRefs';
import { declaredColumns } from '@couchbase-traces/common-utils/dist/couchbase/otelSchema';
import { FROM_KEYSPACE_ALIAS } from '@couchbase-traces/common-utils/dist/couchbase/render/from';
import { keyspace } from '@couchbase-traces/common-utils/dist/couchbase/sqlpp';

/**
 * Unknown-column check for MCP queries (Q53). SQL++ reads a field no document
 * has as MISSING, so `SELECT nonexistent_column_xyz` succeeds with empty
 * values where upstream's ClickHouse failed with UNKNOWN_IDENTIFIER. The MCP
 * tools reject such a query before it is sent, with upstream's error.
 *
 * Scope, chosen so a valid query is never rejected:
 * - Only OTel collections are checked (`otel_logs`, `otel_traces`, …: a
 *   declared schema exists). Other collections are schemaless and pass.
 * - A name outside the declared schema is accepted when the collection's
 *   inferred columns (`describeColumns`) have it, so fields written by
 *   something other than ingest still pass. A lookup failure passes.
 * - Only field roots count: map subfields, functions, aliases, parameters
 *   and range variables are not fields (`fieldReferences`).
 * - Text the scanner cannot scope (joins, subqueries, LET, …) passes.
 */

type ColumnLookup = Parameters<typeof describeColumns>[0];

export type CollectionTarget = {
  connectionId: string;
  databaseName: string;
  scopeName?: string;
  tableName: string;
};

type BuilderItem = {
  valueExpression?: string;
  aggCondition?: string;
  aggConditionLanguage?: string;
};

/** Builder chart fields the check reads. */
export type BuilderColumnsConfig = {
  select?: BuilderItem[] | string;
  groupBy?: BuilderItem[] | string;
  where?: string;
  whereLanguage?: string;
};

/** Roots in `roots` that are no field of the target collection. */
export async function unknownColumns(
  metadata: ColumnLookup,
  target: CollectionTarget,
  roots: string[],
): Promise<string[]> {
  const declared = declaredColumns(target.tableName);
  if (!declared || roots.length === 0) return [];
  const names = new Set(declared.map(c => c.name));
  const suspect = roots.filter(r => !names.has(r));
  if (suspect.length === 0) return [];
  try {
    const { columns, origin } = await describeColumns(metadata, target);
    // A missing collection fails on the server with its own error.
    if (origin === 'missing') return [];
    const found = new Set(columns.map(c => c.name));
    return suspect.filter(r => !found.has(r));
  } catch {
    return [];
  }
}

/** Upstream's error for a column the table lacks. */
export function unknownColumnError(
  names: string[],
  target: CollectionTarget,
): Error {
  const list = names.map(n => `\`${n}\``).join(', ');
  const ks = `${target.databaseName}.${target.scopeName || 'default'}.${target.tableName}`;
  return new Error(
    `UNKNOWN_IDENTIFIER: Unknown expression identifier ${list} in ${ks}: ` +
      'no such field in the collection schema.',
  );
}

function exprRoots(text: string | undefined): string[] {
  if (!text?.trim()) return [];
  return (
    fieldReferences(text, {
      statement: false,
      rowAlias: FROM_KEYSPACE_ALIAS,
    })?.roots ?? []
  );
}

/**
 * Field roots of a builder chart: select value expressions, SQL aggregate
 * conditions, groupBy, and a SQL where. Lucene filters and a search's string
 * select list are not checked.
 */
export function builderFieldRoots(config: BuilderColumnsConfig): string[] {
  const roots: string[] = [];
  const items = (list: BuilderItem[] | string | undefined) =>
    typeof list === 'string' ? [{ valueExpression: list }] : (list ?? []);
  for (const item of items(
    Array.isArray(config.select) ? config.select : undefined,
  )) {
    roots.push(...exprRoots(item.valueExpression));
    if (item.aggConditionLanguage === 'sql') {
      roots.push(...exprRoots(item.aggCondition));
    }
  }
  for (const item of items(config.groupBy)) {
    roots.push(...exprRoots(item.valueExpression));
  }
  if (config.whereLanguage === 'sql') roots.push(...exprRoots(config.where));
  return [...new Set(roots)];
}

/**
 * The collection and field roots of a raw SQL++ statement, or null when it
 * reads no single bucket.scope.collection keyspace. `$__sourceTable` reads as
 * the source's collection.
 */
export function rawSqlFieldRoots(
  sql: string,
  connectionId: string,
  sourceFrom?: { databaseName: string; scopeName?: string; tableName: string },
): { target: CollectionTarget; roots: string[] } | null {
  let text = sql;
  if (sourceFrom && /\$__sourceTable\b/.test(sql)) {
    let ks: string;
    try {
      ks = keyspace({
        bucket: sourceFrom.databaseName,
        scope: sourceFrom.scopeName || 'default',
        collection: sourceFrom.tableName,
      });
    } catch {
      return null;
    }
    text = sql.replace(/\$__sourceTable\b/g, ks);
  }
  const refs = fieldReferences(text, { statement: true });
  if (!refs?.keyspace) return null;
  return {
    target: {
      connectionId,
      databaseName: refs.keyspace.bucket,
      scopeName: refs.keyspace.scope,
      tableName: refs.keyspace.collection,
    },
    roots: refs.roots,
  };
}

/** The unknown-column error for a builder chart on `target`, or null. */
export async function builderColumnsError(
  metadata: ColumnLookup,
  target: CollectionTarget,
  config: BuilderColumnsConfig,
): Promise<Error | null> {
  const missing = await unknownColumns(
    metadata,
    target,
    builderFieldRoots(config),
  );
  return missing.length > 0 ? unknownColumnError(missing, target) : null;
}

/** The unknown-column error for a raw SQL++ statement, or null. */
export async function rawSqlColumnsError(
  metadata: ColumnLookup,
  sql: string,
  connectionId: string,
  sourceFrom?: { databaseName: string; scopeName?: string; tableName: string },
): Promise<Error | null> {
  const found = rawSqlFieldRoots(sql, connectionId, sourceFrom);
  if (!found) return null;
  const missing = await unknownColumns(metadata, found.target, found.roots);
  return missing.length > 0 ? unknownColumnError(missing, found.target) : null;
}
