import { describeColumns } from '@couchbase-traces/common-utils/dist/couchbase/describeColumns';
import type { MetricKindTable } from '@couchbase-traces/common-utils/dist/couchbase/metricQueries';
import type { SqlPP } from '@couchbase-traces/common-utils/dist/couchbase/sqlpp';
import { eventTimestampExpr } from '@couchbase-traces/common-utils/dist/couchbase/timestampColumns';
import type { ColumnMeta } from '@couchbase-traces/common-utils/dist/query/types';

import type { DataClient } from '@/query';

/** Couchbase source fields the metric discovery tools read. */
export type MetricSourceFields = {
  from: { databaseName: string; scopeName?: string };
  timestampValueExpression: string;
  timestampFormat?: MetricKindTable['timestampFormat'];
};

type ColumnLookup = Parameters<typeof describeColumns>[0];

export function metricKindTable(
  source: MetricSourceFields,
  tableName: string,
): MetricKindTable {
  return {
    databaseName: source.from.databaseName,
    scopeName: source.from.scopeName,
    tableName,
    timestampValueExpression: source.timestampValueExpression,
    timestampFormat: source.timestampFormat,
  };
}

/**
 * Columns of one metric kind's collection. A missing collection throws, as
 * upstream's query on a missing table did; an empty OTel collection reports
 * its declared schema (Q25).
 */
export async function metricKindColumns(
  metadata: ColumnLookup,
  connectionId: string,
  table: MetricKindTable,
): Promise<{ columns: ColumnMeta[]; known: boolean }> {
  const { columns, origin } = await describeColumns(metadata, {
    connectionId,
    databaseName: table.databaseName,
    scopeName: table.scopeName,
    tableName: table.tableName,
  });
  if (origin === 'missing') {
    throw new Error(
      `Collection ${table.databaseName}.${table.scopeName || 'default'}.${table.tableName} does not exist`,
    );
  }
  return { columns, known: origin !== 'empty' };
}

/**
 * SQL++ reads a field a document lacks as MISSING instead of failing, so a
 * kind pointed at a non-metric collection would look empty. Upstream's query
 * failed on the missing columns; this keeps that failure (partialFailure,
 * not the "no data" hint). Skipped when the collection's fields are unknown.
 */
export function assertMetricColumns(
  table: MetricKindTable,
  found: { columns: ColumnMeta[]; known: boolean },
): void {
  if (!found.known) return;
  const names = new Set(found.columns.map(c => c.name));
  const ts = eventTimestampExpr(table.timestampValueExpression)
    .split('.')[0]
    .replace(/`/g, '');
  const missing = ['MetricName', ts].filter(c => !names.has(c));
  if (missing.length > 0) {
    throw new Error(
      `Missing columns: ${missing.join(', ')} in ${table.tableName}`,
    );
  }
}

/** Runs a built SQL++ statement and returns its rows. */
export async function metricRows<T>(
  dataClient: Pick<DataClient, 'query'>,
  q: SqlPP,
  connectionId: string,
  signal?: AbortSignal,
): Promise<T[]> {
  const result = await dataClient.query({
    query: q.statement,
    query_params: q.parameters,
    format: 'JSONEachRow',
    connectionId,
    abort_signal: signal,
  });
  return ((await (result as { json: () => Promise<T[]> }).json()) ?? []) as T[];
}
