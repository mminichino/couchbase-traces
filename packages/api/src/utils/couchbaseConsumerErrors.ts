import {
  CouchbaseQueryError,
  CouchbaseUnsupportedError,
} from '@couchbase-traces/common-utils/dist/couchbase/errors';

import type { McpErrorResult } from '@/mcp/utils/errors';
import { mcpServerError, mcpUserError } from '@/mcp/utils/errors';

export type ExternalApiErrorField = 'error' | 'message';

function bodyFor<F extends ExternalApiErrorField>(
  field: F,
  message: string,
): Record<F, string> {
  return { [field]: message } as Record<F, string>;
}

export function couchbaseConsumerHttpResponse<F extends ExternalApiErrorField>(
  err: unknown,
  field: F,
): { status: number; body: Record<F, string> } | null {
  if (err instanceof CouchbaseUnsupportedError) {
    const status = /multiSeries/i.test(err.message) ? 422 : 409;
    return { status, body: bodyFor(field, err.message) };
  }
  if (err instanceof CouchbaseQueryError) {
    const safeMsg =
      (err.message.split('\n')[0] ?? '').slice(0, 300) || 'Query error';
    return { status: err.httpStatus, body: bodyFor(field, safeMsg) };
  }
  return null;
}

const SQLPP_HINT = 'This source uses SQL++.';

function firstLine(message: string): string {
  return (message.split('\n')[0] ?? '').trim();
}

/**
 * Map Couchbase data-layer errors to MCP tool errors (Phase 8 §3.5).
 */
export function couchbaseConsumerMcpError(err: unknown): McpErrorResult | null {
  if (err instanceof CouchbaseUnsupportedError) {
    return mcpUserError(err.message);
  }
  if (err instanceof CouchbaseQueryError) {
    const base = firstLine(err.message) || 'Query error';
    const text =
      /parse|syntax/i.test(base) || err.code === 'PARSING_FAILED'
        ? `${base}\n\n${SQLPP_HINT}`
        : err.code === 'KEYSPACE_NOT_FOUND'
          ? // Upstream's UNKNOWN_TABLE says the table doesn't exist; the
            // Query service's "Keyspace not found" names no such reason.
            `${base}\n\nThe keyspace doesn't exist.`
          : base;
    const category =
      err.httpStatus >= 500 ? ('server' as const) : ('user' as const);
    return category === 'server' ? mcpServerError(text) : mcpUserError(text);
  }
  return null;
}

/** Append the SQL++ dialect hint when a Couchbase source failed on a CH-only query. */
export function mcpSqlppDialectHint(
  err: unknown,
  queryLanguage: 'clickhouse' | 'sqlpp',
): string | null {
  if (queryLanguage !== 'sqlpp') return null;
  if (!(err instanceof CouchbaseQueryError) && !(err instanceof Error))
    return null;
  const msg = err instanceof CouchbaseQueryError ? err.message : err.message;
  if (/PARSE|syntax|Syntax/i.test(msg)) return SQLPP_HINT;
  return null;
}
