import { useMemo } from 'react';
import {
  filterSourcesForSlice,
  isCouchbaseSliceEnabled,
  type Slice,
} from '@couchbase-traces/common-utils/dist/dataLayer';
import type { TSource } from '@couchbase-traces/common-utils/dist/types';

import {
  connectionKindFromList,
  useConnectionKind,
} from '@/couchbase/connection';
import { useConnections } from '@/connection';
import { useSources } from '@/source';

export async function filterSearchSources(sources: TSource[]): Promise<TSource[]> {
  return filterSourcesForSlice(sources, 'search');
}

/** Sync slice gating using connection kinds from the connections query. */
export function filterSourcesForSliceWithConnections<T extends { connection: string }>(
  sources: T[],
  slice: Slice,
  connections: { id: string; kind?: string }[] | undefined,
): T[] {
  if (isCouchbaseSliceEnabled(slice)) return sources;
  return sources.filter(
    s => connectionKindFromList(s.connection, connections) !== 'couchbase',
  );
}

export function isSourceAllowedForSlice(
  source: TSource,
  slice: Slice,
  connections: { id: string; kind?: string }[] | undefined,
): boolean {
  if (connectionKindFromList(source.connection, connections) !== 'couchbase') {
    return true;
  }
  return isCouchbaseSliceEnabled(slice);
}

export function useSourcesForSlice(slice: Slice) {
  const query = useSources();
  const { data: connections } = useConnections();
  const data = useMemo(
    () =>
      query.data == null
        ? undefined
        : filterSourcesForSliceWithConnections(query.data, slice, connections),
    [query.data, slice, connections],
  );
  return { ...query, data };
}

export function useIsSourceAllowedForSlice(slice: Slice) {
  const { data: connections } = useConnections();
  return useMemo(
    () => (source: TSource) => isSourceAllowedForSlice(source, slice, connections),
    [slice, connections],
  );
}

export { useConnectionKind };
