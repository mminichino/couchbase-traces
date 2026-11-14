import { useMemo } from 'react';
import { TableConnection } from '@couchbase-traces/common-utils/dist/core/metadata';
import { ColumnMeta } from '@couchbase-traces/common-utils/dist/query';

import {
  getSqlSourceColumnKeys,
  getSqlSourceKeys,
} from '@/components/AdhocDashboardFilter/useAdhocFilterOptions';
import { useAllFields } from '@/hooks/useMetadata';

const keepEveryType = () => true;

/** The source's fields as SQL expressions, for the Pick tabs. */
export function useClauseFieldOptions({
  tableConnection,
  columns,
  dateRange,
  timestampValueExpression,
}: {
  tableConnection: TableConnection | undefined;
  columns: ColumnMeta[] | undefined;
  dateRange?: [Date, Date];
  timestampValueExpression?: string;
}): string[] {
  const { data: fields, isFieldMetadataDisabled } = useAllFields(
    tableConnection,
    {
      dateRange,
      timestampValueExpression,
    },
  );

  return useMemo(() => {
    if (columns == null) return [];
    // Field discovery is off for some teams, and `useAllFields` then returns
    // [] rather than "still loading". Scalar columns are still known.
    const keys =
      isFieldMetadataDisabled || fields == null
        ? getSqlSourceColumnKeys(columns, keepEveryType)
        : getSqlSourceKeys(fields, columns, keepEveryType);
    return Array.from(new Set(keys)).sort();
  }, [fields, columns, isFieldMetadataDisabled]);
}
