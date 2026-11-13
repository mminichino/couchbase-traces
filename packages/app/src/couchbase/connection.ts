import { useMemo } from 'react';

import { useConnections } from '@/connection';

export function connectionKindFromList(
  connectionId: string | null | undefined,
  connections: { id: string; kind?: string }[] | undefined,
): 'clickhouse' | 'couchbase' {
  if (!connectionId) return 'clickhouse';
  const found = connections?.find(c => c.id === connectionId);
  return found?.kind === 'couchbase' ? 'couchbase' : 'clickhouse';
}

export function useConnectionKind(
  connectionId: string | null | undefined,
): 'clickhouse' | 'couchbase' {
  const { data: connections } = useConnections();
  return useMemo(
    () => connectionKindFromList(connectionId, connections),
  [connectionId, connections],
  );
}
