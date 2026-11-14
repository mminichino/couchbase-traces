import { SourceKind } from '@couchbase-traces/common-utils/dist/types';

import type { McpContext } from '@/mcp/tools/types';

/** Dropped source kinds still stored in Mongo but hidden from MCP agents. */
export function isHiddenSource(
  _context: McpContext,
  source: { kind: SourceKind | string },
): boolean {
  return source.kind === SourceKind.Promql || source.kind === 'promql';
}

export function isPromqlEnabled(_context: McpContext): boolean {
  return false;
}

export const PROMQL_SOURCE_USAGE = '';
