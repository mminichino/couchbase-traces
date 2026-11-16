import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type QueryCaptureLine = {
  ts: string;
  statement: string;
  parameters: unknown;
  connectionId: string | null;
  queryContext: { bucket: string; scope: string } | null;
};

/**
 * When CBT_QUERY_CAPTURE_FILE is set, append one NDJSON line per statement.
 * Disabled by default. Acceptance-only; not documented for product use.
 */
export function appendQueryCapture(args: {
  statement: string;
  parameters?: unknown;
  connectionId?: string | null;
  queryContext?: { bucket: string; scope: string } | null;
}): void {
  const file = process.env.CBT_QUERY_CAPTURE_FILE;
  if (!file) return;
  const line: QueryCaptureLine = {
    ts: new Date().toISOString(),
    statement: args.statement,
    parameters: args.parameters ?? null,
    connectionId: args.connectionId ?? null,
    queryContext: args.queryContext ?? null,
  };
  try {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, `${JSON.stringify(line)}\n`, 'utf8');
  } catch {
    // Capture must never break queries.
  }
}
