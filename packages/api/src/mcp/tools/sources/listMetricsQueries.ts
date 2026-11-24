import {
  metricNamesPageQuery,
  metricUnitsQuery,
} from '@couchbase-traces/common-utils/dist/couchbase/metricQueries';
import type { getMetadata } from '@couchbase-traces/common-utils/dist/dataLayer';

import type { DataClient } from '@/query';
import logger from '@/utils/logger';

import type { MetricEntry } from './listMetricsPage';
import type { DiscoverableMetricKind } from './metricKinds';
import {
  assertMetricColumns,
  metricKindColumns,
  metricKindTable,
  metricRows,
  type MetricSourceFields,
} from './metricTable';

type Metadata = ReturnType<typeof getMetadata>;

// Unit and description are effectively constant per metric, so a bounded
// sample of matching documents is enough (upstream: `LIMIT 1 BY MetricName`).
const ENRICH_SAMPLE_PER_NAME = 50;

/**
 * Distinct metric names for one kind, ascending, after `afterName`. A kind
 * whose collection is missing or lacks the metric columns throws, so the
 * caller reports it in partialFailure instead of as "no metrics".
 */
export async function fetchMetricNames({
  dataClient,
  metadata,
  source,
  tableName,
  connectionId,
  startDate,
  endDate,
  namePattern,
  afterName,
  limit,
  signal,
}: {
  dataClient: Pick<DataClient, 'query'>;
  metadata: Metadata;
  source: MetricSourceFields;
  tableName: string;
  connectionId: string;
  startDate: Date;
  endDate: Date;
  namePattern: string | undefined;
  afterName: string | undefined;
  limit: number;
  signal: AbortSignal;
}): Promise<string[]> {
  const table = metricKindTable(source, tableName);
  assertMetricColumns(
    table,
    await metricKindColumns(metadata, connectionId, table),
  );
  const q = metricNamesPageQuery({
    table,
    start: startDate,
    end: endDate,
    namePattern,
    afterName,
    limit,
  });
  const rows = await metricRows<{ MetricName: string }>(
    dataClient,
    q,
    connectionId,
    signal,
  );
  return rows.map(row => row.MetricName);
}

/** Most recent unit and description for a page of metric names. */
async function fetchMetricUnitsAndDescriptions({
  dataClient,
  source,
  tableName,
  connectionId,
  names,
  startDate,
  endDate,
  hasUnit,
  hasDescription,
  signal,
}: {
  dataClient: Pick<DataClient, 'query'>;
  source: MetricSourceFields;
  tableName: string;
  connectionId: string;
  names: string[];
  startDate: Date;
  endDate: Date;
  hasUnit: boolean;
  hasDescription: boolean;
  signal: AbortSignal;
}): Promise<Map<string, { unit?: string; description?: string }>> {
  const enrichments = new Map<
    string,
    { unit?: string; description?: string }
  >();
  if (names.length === 0 || (!hasUnit && !hasDescription)) return enrichments;

  const q = metricUnitsQuery({
    table: metricKindTable(source, tableName),
    names,
    hasUnit,
    hasDescription,
    start: startDate,
    end: endDate,
    sampleSize: names.length * ENRICH_SAMPLE_PER_NAME,
  });
  const rows = await metricRows<{
    MetricName: string;
    MetricUnit?: string | null;
    MetricDescription?: string | null;
  }>(dataClient, q, connectionId, signal);
  for (const row of rows) {
    enrichments.set(row.MetricName, {
      ...(row.MetricUnit ? { unit: row.MetricUnit } : {}),
      ...(row.MetricDescription ? { description: row.MetricDescription } : {}),
    });
  }
  return enrichments;
}

type Enrichments = Awaited<ReturnType<typeof fetchMetricUnitsAndDescriptions>>;

/**
 * Attach unit and description to each entry. Best effort: on failure or
 * timeout the names are still returned.
 */
export async function enrichEntries({
  entries,
  dataClient,
  metadata,
  source,
  metricTables,
  connectionId,
  startDate,
  endDate,
  signal,
}: {
  entries: MetricEntry[];
  dataClient: DataClient;
  metadata: Metadata;
  source: MetricSourceFields;
  metricTables: Partial<Record<DiscoverableMetricKind, string>>;
  connectionId: string;
  startDate: Date;
  endDate: Date;
  signal: AbortSignal;
}): Promise<MetricEntry[]> {
  const kinds = [...new Set(entries.map(e => e.kind))];
  // The column lookup takes no abort signal, so race the whole lookup
  // against it; otherwise a slow schema lookup could outlast the call's
  // wall clock and discard the names already collected.
  const aborted = new Promise<undefined>(resolve => {
    if (signal.aborted) resolve(undefined);
    signal.addEventListener('abort', () => resolve(undefined), { once: true });
  });
  const lookups = Promise.all(
    kinds.map(async (kind): Promise<[DiscoverableMetricKind, Enrichments]> => {
      const tableName = metricTables[kind]!;
      try {
        // Skip MetricUnit / MetricDescription on non-OTel-default schemas.
        const { columns } = await metricKindColumns(
          metadata,
          connectionId,
          metricKindTable(source, tableName),
        );
        const columnNames = new Set(columns.map(c => c.name));
        const enrichments = await fetchMetricUnitsAndDescriptions({
          dataClient,
          source,
          tableName,
          connectionId,
          names: entries.filter(e => e.kind === kind).map(e => e.name),
          startDate,
          endDate,
          hasUnit: columnNames.has('MetricUnit'),
          hasDescription: columnNames.has('MetricDescription'),
          signal,
        });
        return [kind, enrichments];
      } catch (e) {
        logger.warn(
          { kind, tableName, error: e instanceof Error ? e.message : e },
          'Failed to fetch metric unit/description',
        );
        return [kind, new Map()];
      }
    }),
  );
  const byKind = await Promise.race([lookups, aborted]);
  if (!byKind) {
    logger.warn(
      { kinds },
      'Timed out fetching metric unit/description; returning names only',
    );
    return entries;
  }
  const enrichments = new Map(byKind);
  return entries.map(entry => ({
    ...entry,
    ...enrichments.get(entry.kind)?.get(entry.name),
  }));
}
