import SqlString from 'sqlstring';
import { tcFromSource } from '@couchbase-traces/common-utils/dist/core/metadata';
import { quoteIdent } from '@couchbase-traces/common-utils/dist/couchbase/sqlpp';
import { TSource } from '@couchbase-traces/common-utils/dist/types';

import { useConnectionKind } from '@/couchbase/connection';

import { useJsonColumns } from './useMetadata';

export type FieldExpressionGenerator = (
  /** The column name, either a Map or a JSON column */
  column: string,
  /** The map key or JSON path to access */
  key: string,
  /** Function to convert a Dynamic field from JSON to a non-Dynamic type. Defaults to toString */
  convertFn?: string,
) => string;

function couchbaseFieldAccess(
  column: string,
  key: string,
  convertFn: string,
): string {
  const access = `${quoteIdent(column)}.${quoteIdent(key)}`;
  if (convertFn === 'toString' || convertFn === '') {
    return `TOSTRING(${access})`;
  }
  if (convertFn === 'toFloat64' || convertFn === 'toFloat64OrNull') {
    return `TONUMBER(${access})`;
  }
  if (convertFn === 'toUInt64' || convertFn === 'toInt64' || convertFn === 'toInt') {
    return `TRUNC(TONUMBER(${access}))`;
  }
  // Unknown convertFn: still return object access; callers that need a cast
  // should use a known convertFn.
  return access;
}

/** Utility for rendering SQL field access expressions for Maps and JSON types. */
export default function useFieldExpressionGenerator(
  source: TSource | undefined,
): {
  isLoading: boolean;
  getFieldExpression: FieldExpressionGenerator | undefined;
} {
  const { data: jsonColumns, isLoading: isLoadingJsonColumns } = useJsonColumns(
    tcFromSource(source),
  );
  const connectionKind = useConnectionKind(source?.connection);

  if (source && !isLoadingJsonColumns) {
    return {
      isLoading: false,
      getFieldExpression: (
        column: string,
        key: string,
        convertFn: string = 'toString',
      ) => {
        if (connectionKind === 'couchbase') {
          return couchbaseFieldAccess(column, key, convertFn);
        }
        const isJson = jsonColumns?.includes(column);
        return isJson
          ? SqlString.format(`${convertFn}(??.??)`, [column, key])
          : SqlString.format('??[?]', [column, key]);
      },
    };
  } else {
    return {
      isLoading: isLoadingJsonColumns,
      getFieldExpression: undefined,
    };
  }
}
