import type { Metadata } from '@couchbase-traces/common-utils/dist/core/metadata';
import {
  type MetricKindTable,
  metricUnitsQuery,
} from '@couchbase-traces/common-utils/dist/couchbase/metricQueries';

import { DataClient } from '@/query';
import logger from '@/utils/logger';

import { metricKindColumns, metricRows } from './metricTable';

// Max MetricName values returned per metric kind by the starter sample.
// clickstack_list_metrics provides paginated discovery beyond this cap.
const MAX_METRIC_NAMES_PER_KIND = 20;

/**
 * Lookback windows tried in order (shortest to longest) when sampling
 * metric names. The first window that yields any names wins. Starting
 * small keeps the common case (actively-reporting metrics) cheap on
 * large tables; metrics reported sparsely (batch jobs, low-traffic
 * services) or backfilled historical data may have no recent points —
 * falling back to a wider window keeps the sample useful instead of
 * silently empty.
 */
const METRIC_NAME_LOOKBACK_WINDOWS_MS: readonly number[] = [
  60 * 60 * 1000, // 1 hour
  24 * 60 * 60 * 1000, // 24 hours
  30 * 24 * 60 * 60 * 1000, // 30 days
];

export type MetricNameSample = {
  name: string;
  unit?: string;
  description?: string;
};

/**
 * Sample distinct MetricName values for a single metric kind. Optionally
 * enriches each name with MetricUnit / MetricDescription when those
 * columns are present on the table (the OTel Collector default schema
 * includes them; custom schemas may not).
 */
export async function sampleMetricNamesForKind({
  metadata,
  dataClient,
  databaseName,
  scopeName,
  tableName,
  connectionId,
  dateRange,
  timestampValueExpression,
  timestampFormat,
  signal,
  maxNames = MAX_METRIC_NAMES_PER_KIND,
  enrich = true,
}: {
  metadata: Metadata;
  dataClient: DataClient;
  databaseName: string;
  scopeName?: string;
  tableName: string;
  connectionId: string;
  dateRange: [Date, Date];
  timestampValueExpression: string;
  timestampFormat?: MetricKindTable['timestampFormat'];
  signal: AbortSignal;
  maxNames?: number;
  enrich?: boolean;
}): Promise<MetricNameSample[]> {
  // First fetch the distinct metric names; this is the only step that
  // strictly needs to succeed for the kind to appear in the response.
  // Pass timestampValueExpression so the no-rollup fallback path scopes
  // its scan to dateRange instead of going unbounded against the raw
  // metric table on cold cache.
  const nameResults = await metadata.getAllKeyValues({
    databaseName,
    scopeName,
    tableName,
    keyExpressions: ['MetricName'],
    maxValuesPerKey: maxNames,
    connectionId,
    dateRange,
    timestampValueExpression,
  });
  const names = nameResults[0]?.value.map(v => v.toString()) ?? [];
  if (names.length === 0) return [];

  if (!enrich) {
    return names.map(name => ({ name }));
  }

  // Defensive column presence check for MetricUnit / MetricDescription.
  // Column lookups are cached per (connection, keyspace).
  const table: MetricKindTable = {
    databaseName,
    scopeName,
    tableName,
    timestampValueExpression,
    timestampFormat,
  };
  const { columns: kindColumns } = await metricKindColumns(
    metadata,
    connectionId,
    table,
  );
  const columnNames = new Set(kindColumns.map(c => c.name));
  const hasUnit = columnNames.has('MetricUnit');
  const hasDescription = columnNames.has('MetricDescription');

  // Best-effort enrichment with unit + description. One small query
  // returns one row per metric name with the most-recent unit / desc.
  let enrichments = new Map<string, { unit?: string; description?: string }>();
  if ((hasUnit || hasDescription) && !signal.aborted) {
    try {
      enrichments = await fetchMetricNameEnrichments({
        dataClient,
        table,
        connectionId,
        names,
        dateRange,
        hasUnit,
        hasDescription,
        signal,
      });
    } catch (e) {
      logger.warn(
        { databaseName, tableName, error: e },
        'Failed to enrich metric names with unit/description',
      );
    }
  }

  return names.map(name => {
    const enrichment = enrichments.get(name) ?? {};
    const sample: MetricNameSample = { name };
    if (enrichment.unit) sample.unit = enrichment.unit;
    if (enrichment.description) sample.description = enrichment.description;
    return sample;
  });
}

/**
 * Sample metric names for a kind, widening the lookback window until a
 * non-empty sample is found (see METRIC_NAME_LOOKBACK_WINDOWS_MS).
 * Returns the first non-empty sample, or [] when every window is empty.
 */
export async function sampleMetricNamesWithLookback({
  now = new Date(),
  windowsMs = METRIC_NAME_LOOKBACK_WINDOWS_MS,
  ...rest
}: Omit<Parameters<typeof sampleMetricNamesForKind>[0], 'dateRange'> & {
  now?: Date;
  windowsMs?: readonly number[];
}): Promise<MetricNameSample[]> {
  // Each fallback window ends where the previous (shorter) window
  // started: that slice is already known to be empty, so rescanning it
  // would be wasted work. Assumes windowsMs is sorted ascending.
  let windowEnd = now;
  for (const windowMs of windowsMs) {
    if (rest.signal.aborted) break;
    const windowStart = new Date(now.getTime() - windowMs);
    const samples = await sampleMetricNamesForKind({
      ...rest,
      dateRange: [windowStart, windowEnd],
    });
    if (samples.length > 0) return samples;
    windowEnd = windowStart;
  }
  return [];
}

/**
 * Fetch MetricUnit and MetricDescription for a batch of metric names; the
 * most recent value wins, as upstream's `argMax(col, TimeUnix)`.
 */
async function fetchMetricNameEnrichments({
  dataClient,
  table,
  connectionId,
  names,
  dateRange,
  hasUnit,
  hasDescription,
  signal,
}: {
  dataClient: DataClient;
  table: MetricKindTable;
  connectionId: string;
  names: string[];
  dateRange: [Date, Date];
  hasUnit: boolean;
  hasDescription: boolean;
  signal: AbortSignal;
}): Promise<Map<string, { unit?: string; description?: string }>> {
  const q = metricUnitsQuery({
    table,
    names,
    hasUnit,
    hasDescription,
    start: dateRange[0],
    end: dateRange[1],
  });
  const rows = await metricRows<{
    MetricName: string;
    MetricUnit?: string | null;
    MetricDescription?: string | null;
  }>(dataClient, q, connectionId, signal);

  const enrichments = new Map<
    string,
    { unit?: string; description?: string }
  >();
  for (const row of rows) {
    enrichments.set(row.MetricName, {
      ...(row.MetricUnit ? { unit: row.MetricUnit } : {}),
      ...(row.MetricDescription ? { description: row.MetricDescription } : {}),
    });
  }
  return enrichments;
}
