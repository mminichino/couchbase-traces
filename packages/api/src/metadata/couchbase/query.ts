import type { SqlPP } from '@couchbase-traces/common-utils/dist/couchbase/sqlpp';
import {
  type QueryOptions as QueryOptionsSdk,
  QueryScanConsistency,
} from 'couchbase';
import type { z } from 'zod';

import { fromCouchbaseError, MetadataError } from '@/metadata/errors';
import type { Consistency } from '@/metadata/types';

export type QueryOptions = {
  /** Read-your-writes by default (plan D11). */
  consistency?: Consistency;
  timeoutMs?: number;
  secrets?: string[];
};

/**
 * Runs one SQL++ statement built with the `sqlpp` tag, so every value is a
 * named parameter and every identifier went through quoteIdent. Raw strings
 * are not accepted.
 */
/** The slice of the SDK Cluster runQuery uses; a Cluster satisfies it. */
export type QueryPort = {
  query(
    statement: string,
    o: QueryOptionsSdk,
  ): PromiseLike<{ rows: unknown[] }>;
};

export async function runQuery<T>(
  cluster: QueryPort,
  q: SqlPP,
  schema?: z.ZodType<T>,
  o: QueryOptions = {},
): Promise<T[]> {
  let rows: unknown[];
  try {
    const res = await cluster.query(q.statement, {
      parameters: q.parameters,
      scanConsistency:
        o.consistency === 'not_bounded'
          ? QueryScanConsistency.NotBounded
          : QueryScanConsistency.RequestPlus,
      timeout: o.timeoutMs,
    });
    rows = res.rows;
  } catch (err) {
    throw fromCouchbaseError(err, { secrets: o.secrets });
  }
  // Without a schema the caller vouches for the row shape (projections only).
  if (!schema) return rows as T[];
  return rows.map((row, i) => {
    const parsed = schema.safeParse(row);
    if (!parsed.success) {
      throw new MetadataError(
        `Row ${i} failed validation: ${parsed.error.issues[0]?.message ?? 'invalid'}`,
      );
    }
    return parsed.data;
  });
}
