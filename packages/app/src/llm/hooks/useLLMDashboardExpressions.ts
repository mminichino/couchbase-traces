import { useMemo } from 'react';
import { tcFromSource } from '@couchbase-traces/common-utils/dist/core/metadata';
import {
  SourceKind,
  TLogSource,
  TSource,
  TTraceSource,
} from '@couchbase-traces/common-utils/dist/types';

import { useConnections } from '@/connection';
import { connectionKindFromList } from '@/couchbase/connection';
import { useJsonColumns } from '@/hooks/useMetadata';
import { getLLMExpressions, getLLMLogExpressions } from '@/llm/lib/expressions';
import type { SqlDialect } from '@/llm/lib/sqlDialect';

type ExpressionInputs = { jsonColumns: string[]; dialect: SqlDialect };

/**
 * What both hooks need before deriving expressions: the source's JSON-typed
 * columns and its connection dialect. `undefined` until both resolve, so a
 * Couchbase source never renders a ClickHouse expression set.
 */
function useExpressionInputs(source: TSource | undefined) {
  const tableConnection = useMemo(() => tcFromSource(source), [source]);
  const { data: jsonColumns, isLoading: isJsonColumnsLoading } =
    useJsonColumns(tableConnection);
  const { data: connections, isLoading: isConnectionsLoading } =
    useConnections();
  const isLoading = !source || isJsonColumnsLoading || isConnectionsLoading;
  const inputs = useMemo((): ExpressionInputs | undefined => {
    if (isLoading || !jsonColumns) return undefined;
    return {
      jsonColumns,
      dialect: connectionKindFromList(source?.connection, connections),
    };
  }, [isLoading, jsonColumns, source?.connection, connections]);
  return { inputs, isLoading };
}

/**
 * Derive the LLM dashboard SQL expressions for a trace source, resolving
 * whether the attribute column is JSON-typed (mirrors
 * useServiceDashboardExpressions).
 */
export function useLLMDashboardExpressions({
  source,
}: {
  source: TSource | undefined;
}) {
  const { inputs, isLoading } = useExpressionInputs(source);
  const expressions = useMemo(() => {
    if (!inputs || source?.kind !== SourceKind.Trace) return undefined;
    const trace: TTraceSource = source;
    return getLLMExpressions(trace, inputs.jsonColumns, inputs.dialect);
  }, [source, inputs]);
  return { expressions, isLoading };
}

/** Log-source variant: session/detection expressions over LogAttributes. */
export function useLLMLogDashboardExpressions({
  source,
}: {
  source: TSource | undefined;
}) {
  const { inputs, isLoading } = useExpressionInputs(source);
  const expressions = useMemo(() => {
    if (!inputs || source?.kind !== SourceKind.Log) return undefined;
    const log: TLogSource = source;
    return getLLMLogExpressions(log, inputs.jsonColumns, inputs.dialect);
  }, [source, inputs]);
  return { expressions, isLoading };
}
