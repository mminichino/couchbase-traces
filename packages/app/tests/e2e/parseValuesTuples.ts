/**
 * Couchbase seeding uses the same row objects as legacy store VALUES generators.
 * Callers should use the exported builders rather than parsing tuple strings.
 */
import type { E2eClickHouseRow } from './seed-data';
import {
  buildE2eCustomServiceLogRows,
  buildE2eMainLogRows,
  buildE2eTraceRows,
} from './seed-data';

export type { E2eClickHouseRow };

export function parseValuesTuples(
  table: 'e2e_otel_logs' | 'e2e_otel_traces' | 'e2e_custom_service_name',
  count: number,
  startMs: number,
  endMs: number,
): E2eClickHouseRow[] {
  switch (table) {
    case 'e2e_otel_logs':
      return buildE2eMainLogRows(count, startMs, endMs);
    case 'e2e_otel_traces':
      return buildE2eTraceRows(count, startMs, endMs);
    case 'e2e_custom_service_name':
      return buildE2eCustomServiceLogRows(count, startMs, endMs);
    default:
      throw new Error(`Unsupported E2E table: ${table}`);
  }
}
