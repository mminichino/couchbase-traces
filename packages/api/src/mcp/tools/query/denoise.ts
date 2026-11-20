import { getMetadata } from '@couchbase-traces/common-utils/dist/dataLayer';
import {
  buildNoisyBodyMatcher,
  DENOISE_SAMPLE_SIZE,
  minePatterns,
  selectNoisyPatterns,
} from '@couchbase-traces/common-utils/dist/drain';

import { getConnectionById } from '@/controllers/connection';
import { getSource } from '@/controllers/sources';
import { MCP_REQUEST_TIMEOUT } from '@/mcp/tools/query/helpers';
import { assertMcpSliceForConnection } from '@/mcp/utils/mcpSlice';
import { DataClient } from '@/query';

import { resolveBodyExpression } from './helpers';
import {
  patternBody,
  patternQueryConfigs,
  patternQuerySource,
  patternTimestamp,
  patternTotal,
} from './patternQueries';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DenoiseResult {
  /** Filtered rows with noisy patterns removed. */
  rows: Record<string, unknown>[];
  /** Patterns that were identified as noisy and removed. */
  removedPatterns: Array<{
    pattern: string;
    estimatedCount: number;
    sampleCount: number;
  }>;
  /**
   * When non-null, denoising was skipped and rows are returned unmodified.
   * The value describes why (e.g. "body_column_not_in_results").
   */
  skipped?: string;
}

// ─── Core denoising function ─────────────────────────────────────────────────

/**
 * Denoise search results by mining patterns from a random sample, identifying
 * "noisy" patterns (those accounting for >5% of the sample), and filtering
 * them out of the result rows.
 *
 * This mirrors the web app's "Denoise Results" feature
 * (packages/app/src/components/DBRowTable.tsx) but runs server-side using
 * the shared TypeScript Drain implementation.
 */
export async function denoiseSearchResults(
  teamId: string,
  sourceId: string,
  startDate: Date,
  endDate: Date,
  rows: Record<string, unknown>[],
  options?: {
    where?: string;
    whereLanguage?: 'lucene' | 'sql';
  },
): Promise<DenoiseResult> {
  if (rows.length === 0) {
    return { rows, removedPatterns: [], skipped: 'no_rows' };
  }

  // ── Resolve source & connection ──
  const source = await getSource(teamId, sourceId);
  if (!source) {
    return { rows, removedPatterns: [], skipped: 'source_not_found' };
  }

  const bodyColumn = resolveBodyExpression(source);
  if (!bodyColumn) {
    return { rows, removedPatterns: [], skipped: 'no_body_column' };
  }

  const connection = await getConnectionById(
    teamId,
    source.connection.toString(),
    true,
  );
  if (!connection) {
    return { rows, removedPatterns: [], skipped: 'connection_not_found' };
  }

  const sliceErr = await assertMcpSliceForConnection(
    source.connection.toString(),
  );
  if (sliceErr) {
    return { rows, removedPatterns: [], skipped: 'slice_off' };
  }

  const dataClient = new DataClient({
    requestTimeout: MCP_REQUEST_TIMEOUT,
  });
  const metadata = getMetadata(dataClient);

  const { sampleConfig, countConfig } = patternQueryConfigs(
    patternQuerySource(source),
    {
      bodyColumn,
      sampleSize: DENOISE_SAMPLE_SIZE,
      dateRange: [startDate, endDate],
      where: options?.where,
      whereLanguage: options?.whereLanguage,
    },
  );

  let sampleResult: Awaited<ReturnType<typeof dataClient.queryChartConfig>>;
  let countResult: Awaited<ReturnType<typeof dataClient.queryChartConfig>>;
  try {
    [sampleResult, countResult] = await Promise.all([
      dataClient.queryChartConfig({
        config: sampleConfig,
        metadata,
        querySettings: source.querySettings,
        opts: {},
      }),
      dataClient.queryChartConfig({
        config: countConfig,
        metadata,
        querySettings: source.querySettings,
        opts: {},
      }),
    ]);
  } catch {
    // If sampling fails, return rows unmodified rather than failing the search
    return { rows, removedPatterns: [], skipped: 'sampling_failed' };
  }

  const sampleRows = sampleResult.data;
  const totalCount = patternTotal(countResult.data);

  if (!sampleRows || sampleRows.length === 0) {
    return { rows, removedPatterns: [], skipped: 'no_sample_data' };
  }

  // ── Mine patterns from the sample ──
  // Note: maxSamples: 1 — minePatterns always keeps at least one sample per
  // cluster internally; we just minimize memory overhead.
  const { patterns } = minePatterns(sampleRows, {
    totalCount,
    startDate,
    endDate,
    maxSamples: 1,
    getBody: patternBody,
    getTimestamp: patternTimestamp,
  });

  if (patterns.length === 0) {
    return { rows, removedPatterns: [] };
  }

  const noisy = selectNoisyPatterns(
    patterns,
    p => p.sampleCount,
    sampleRows.length,
  );
  const noisyTemplates = new Set(noisy.map(p => p.pattern));
  const removedPatterns: DenoiseResult['removedPatterns'] = noisy.map(p => ({
    pattern: p.pattern,
    estimatedCount: p.estimatedCount,
    sampleCount: p.sampleCount,
  }));

  if (noisyTemplates.size === 0) {
    return { rows, removedPatterns: [] };
  }

  const bodyColumnKey = findBodyColumnKey(rows[0], bodyColumn);
  if (!bodyColumnKey) {
    return {
      rows,
      removedPatterns: [],
      skipped: 'body_column_not_in_results',
    };
  }

  const isNoisy = buildNoisyBodyMatcher(
    patterns.map(p => p.pattern),
    noisyTemplates,
  );
  const filteredRows = rows.filter(row => {
    const bodyValue = row[bodyColumnKey];
    if (bodyValue == null) return true; // Keep rows with no body
    return !isNoisy(String(bodyValue));
  });

  return {
    rows: filteredRows,
    removedPatterns,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Find the key in a result row that corresponds to the body column expression.
 * legacy store may return the column under its expression name or a simplified alias.
 */
function findBodyColumnKey(
  row: Record<string, unknown>,
  bodyColumn: string,
): string | null {
  // Direct match (e.g. "Body", "SpanName")
  if (bodyColumn in row) return bodyColumn;

  // Case-insensitive match
  const lowerBody = bodyColumn.toLowerCase();
  for (const key of Object.keys(row)) {
    if (key.toLowerCase() === lowerBody) return key;
  }

  return null;
}
