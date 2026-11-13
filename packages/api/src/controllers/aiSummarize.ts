import { ROW_ID_ALIAS } from '@couchbase-traces/common-utils/dist/couchbase/render';
import type { QueryLanguage } from '@couchbase-traces/common-utils/dist/dataLayer';
import { z } from 'zod';

export const SummarizeResultsSchema = z.object({
  summary: z
    .string()
    .describe('A concise plain-language summary of the query result'),
});

export type SummarizeResultsOutput = z.infer<typeof SummarizeResultsSchema>;

export function normalizeRowsForSummarization(
  rows: Record<string, unknown>[],
): Record<string, unknown>[] {
  return rows.map(row => {
    if (!(ROW_ID_ALIAS in row)) return row;
    const { [ROW_ID_ALIAS]: _rowId, ...rest } = row;
    return rest;
  });
}

function datastoreLabel(queryLanguage: QueryLanguage): string {
  return queryLanguage === 'sqlpp' ? 'SQL++ (Couchbase)' : 'ClickHouse SQL';
}

export function buildSummarizeResultsPrompt({
  queryLanguage,
  rows,
  question,
}: {
  queryLanguage: QueryLanguage;
  rows: Record<string, unknown>[];
  question?: string;
}): string {
  const normalized = normalizeRowsForSummarization(rows);
  const sample = JSON.stringify(normalized.slice(0, 50));
  const rowNote =
    normalized.length > 50
      ? `\n(Showing 50 of ${normalized.length} rows.)`
      : '';

  return `You are an AI assistant for Couchbase Traces. Summarize the following query result rows for an engineer.
The data was queried with ${datastoreLabel(queryLanguage)}. Field names may use SQL++ backtick quoting in conditions elsewhere; row keys here are plain column names as returned by the query.

${question ? `The user asked: ${question}\n` : ''}
Rows:
${sample}${rowNote}

Highlight patterns, outliers, errors, and notable values. Be concise.`;
}
