import type { ColumnMetaType } from '@couchbase-traces/common-utils/dist/clickhouse';

import { HIDDEN_ROW_COLUMNS } from '@/couchbase/dialect';

export function isHiddenRowColumn(name: string): boolean {
  return HIDDEN_ROW_COLUMNS.has(name);
}

export function filterVisibleRowMeta(
  meta: ColumnMetaType[] | undefined,
): ColumnMetaType[] {
  return meta?.filter(c => !isHiddenRowColumn(c.name)) ?? [];
}

export function stripHiddenRowFields<T extends Record<string, unknown>>(
  row: T,
): T {
  const out = { ...row };
  for (const key of HIDDEN_ROW_COLUMNS) {
    delete out[key];
  }
  return out;
}
