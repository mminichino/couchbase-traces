import { ROW_ID_ALIAS } from '@couchbase-traces/common-utils/dist/couchbase/render';
import type { ColumnMetaType } from '@couchbase-traces/common-utils/dist/query';

import { HIDDEN_ROW_COLUMNS } from '@/couchbase/dialect';

export function isHiddenRowColumn(name: string): boolean {
  return HIDDEN_ROW_COLUMNS.has(name);
}

export function filterVisibleRowMeta(
  meta: ColumnMetaType[] | undefined,
): ColumnMetaType[] {
  return meta?.filter(c => !isHiddenRowColumn(c.name)) ?? [];
}

/**
 * Drop display-only hidden columns from a result row. Keeps
 * {@link ROW_ID_ALIAS} so `useRowWhere` can build `META(d).id = …` instead of
 * falling back to ClickHouse-shaped column predicates.
 */
export function stripHiddenRowFields<T extends Record<string, unknown>>(
  row: T,
): T {
  const out = { ...row };
  for (const key of HIDDEN_ROW_COLUMNS) {
    if (key === ROW_ID_ALIAS) continue;
    delete out[key];
  }
  return out;
}
