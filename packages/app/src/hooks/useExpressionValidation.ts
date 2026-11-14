import { useCallback, useState } from 'react';
import { QueryError } from '@couchbase-traces/common-utils/dist/query';
import { useDebouncedCallback, useDidUpdate } from '@mantine/hooks';

import { useExplainQuery } from '@/hooks/useExplainQuery';

export type TableConnectionLike = {
  databaseName: string;
  tableName: string;
  connectionId: string;
};

export function useExpressionValidation({
  expression,
  alias,
  tableConnection,
  debounceMs = 1000,
}: {
  expression: string | undefined;
  alias?: string;
  tableConnection: TableConnectionLike;
  debounceMs?: number;
}) {
  const [explainParams, setExplainParams] = useState<{
    expression?: string;
    alias?: string;
  }>();

  const setExplainParamsDebounced = useDebouncedCallback(
    (params: { expression?: string; alias?: string }) => {
      setExplainParams(params);
    },
    debounceMs,
  );

  useDidUpdate(() => {
    setExplainParamsDebounced({ expression, alias });
  }, [expression, alias]);

  const { databaseName, tableName, connectionId } = tableConnection;

  const { data, error, isLoading } = useExplainQuery(
    {
      from: { databaseName, tableName },
      connection: connectionId,
      select: [
        {
          alias: explainParams?.alias,
          valueExpression: explainParams?.expression ?? '',
        },
      ],
      where: '',
    },
    {
      enabled: !!explainParams?.expression,
    },
  );

  const isValid = !!data?.length;

  const isInvalid = error instanceof QueryError;

  const matchesCurrentInput =
    explainParams?.expression === expression && explainParams?.alias === alias;

  const shouldShowResult = matchesCurrentInput && (isValid || isInvalid);

  const validateNow = useCallback(() => {
    setExplainParams({ expression, alias });
  }, [expression, alias]);

  return {
    isValid,
    isInvalid,
    isLoading,
    error,
    shouldShowResult,
    validateNow,
  };
}
