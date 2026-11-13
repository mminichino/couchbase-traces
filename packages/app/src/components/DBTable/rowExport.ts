import { ROW_ID_ALIAS } from '@couchbase-traces/common-utils/dist/couchbase/render';

import { HIDDEN_ROW_COLUMNS } from '@/couchbase/dialect';
import { INTERNAL_ROW_FIELDS } from '@/hooks/useRowWhere';

/**
 * Strips the table's internal tracking fields and restores JSON columns that
 * were stringified for display, so an exported row reads like the source event.
 *
 * `columns` limits the result to those keys, in that order. Rows carry more
 * than the user selected — the query appends primary key, partition key and
 * block columns to identify rows — so exports that should mirror the table
 * pass the displayed columns.
 */
export function toExportableRow(
  row: Record<string, any>,
  columns?: string[],
): Record<string, any> {
  const {
    [INTERNAL_ROW_FIELDS.ID]: _id,
    [INTERNAL_ROW_FIELDS.ALIAS_WITH]: _aliasWith,
    [ROW_ID_ALIAS]: _cbtId,
    ...rest
  } = row;
  for (const key of HIDDEN_ROW_COLUMNS) {
    delete rest[key];
  }

  const entries =
    columns == null
      ? Object.entries(rest)
      : columns.map(column => [column, rest[column]] as const);

  return Object.fromEntries(
    entries.map(([key, value]) => {
      if (
        typeof value === 'string' &&
        (value.startsWith('{') || value.startsWith('['))
      ) {
        try {
          return [key, JSON.parse(value)];
        } catch {
          return [key, value];
        }
      }
      return [key, value];
    }),
  );
}
