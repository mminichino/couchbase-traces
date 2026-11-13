import { assertSliceForConnection } from '@couchbase-traces/common-utils/dist/dataLayer';

import type { McpErrorResult } from '@/mcp/utils/errors';
import { couchbaseConsumerMcpError } from '@/utils/couchbaseConsumerErrors';

/**
 * Phase 8 MCP slice guard. Returns a tool error when the slice is off for a
 * Couchbase connection; otherwise resolves without throwing.
 */
export async function assertMcpSliceForConnection(
  connectionId: string | undefined,
): Promise<McpErrorResult | null> {
  try {
    await assertSliceForConnection('mcp', connectionId);
    return null;
  } catch (e) {
    return couchbaseConsumerMcpError(e) ?? null;
  }
}
