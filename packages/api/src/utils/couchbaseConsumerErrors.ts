import { CouchbaseQueryError } from '@couchbase-traces/common-utils/dist/couchbase/errors';
import {
  CouchbaseNotReadyError,
  CouchbaseUnsupportedError,
} from '@couchbase-traces/common-utils/dist/dataLayer';

import type { McpErrorResult } from '@/mcp/utils/errors';
import { mcpServerError, mcpUserError } from '@/mcp/utils/errors';

export type ExternalApiErrorField = 'error' | 'message';

export function couchbaseConsumerHttpResponse(
  err: unknown,
  field: ExternalApiErrorField,
): { status: number; body: Record<ExternalApiErrorField, string> } | null {
  if (err instanceof CouchbaseNotReadyError) {
    return { status: 409, body: { [field]: err.message } };
  }
  if (err instanceof CouchbaseUnsupportedError) {
    return { status: 422, body: { [field]: err.message } };
  }
  if (err instanceof CouchbaseQueryError) {
    const safeMsg =
      (err.message.split('\n')[0] ?? '').slice(0, 300) || 'Query error';
    return { status: err.httpStatus, body: { [field]: safeMsg } };
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
  if (err instanceof CouchbaseNotReadyError) {
    return mcpUserError(err.message);
  }
  if (err instanceof CouchbaseUnsupportedError) {
    return mcpUserError(err.message);
  }
  if (err instanceof CouchbaseQueryError) {
    const base = firstLine(err.message) || 'Query error';
    const text =
      /parse|syntax/i.test(base) || err.code === 'PARSE_ERROR'
        ? `${base}\n\n${SQLPP_HINT}`
        : base;
    const category =
      err.httpStatus >= 500 ? ('server' as const) : ('user' as const);
    return category === 'server' ? mcpServerError(text) : mcpUserError(text);
  }
  return null;
}

/** Append the SQL++ dialect hint when a Couchbase source failed on a CH-only query. */
export function mcpSqlppDialectHint(err: unknown, queryLanguage: 'clickhouse' | 'sqlpp'): string | null {
  if (queryLanguage !== 'sqlpp') return null;
  if (!(err instanceof CouchbaseQueryError) && !(err instanceof Error)) return null;
  const msg = err instanceof CouchbaseQueryError ? err.message : err.message;
  if (/PARSE|syntax|Syntax/i.test(msg)) return SQLPP_HINT;
  return null;
}
