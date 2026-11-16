import {
  DataClient,
  type DataClientOptions,
  getDataClient as createDataClient,
} from '@couchbase-traces/common-utils/dist/dataLayer/browser';
import type { QueryAttribution } from '@couchbase-traces/common-utils/dist/query/attribution';
import { mergeQueryAttribution } from '@couchbase-traces/common-utils/dist/query/attribution';
import type { ResponseJSON } from '@couchbase-traces/common-utils/dist/query/types';
import type { ColumnMeta } from '@couchbase-traces/common-utils/dist/query/types';
import { useQuery, UseQueryOptions } from '@tanstack/react-query';

import {
  useMetadataQueryAttribution,
  useQueryAttribution,
} from '@/queryAttribution';

import api from './api';
import { DEFAULT_QUERY_TIMEOUT } from './defaults';

export type { DataClientOptions };

export const getDataClient = (
  options: DataClientOptions & { attribution: QueryAttribution },
): DataClient => createDataClient(options);

/** Team / default queryTimeout is seconds; the data client expects ms. */
export function queryTimeoutToRequestTimeoutMs(
  queryTimeoutSec: number | null | undefined,
): number | undefined {
  if (queryTimeoutSec == null) return undefined;
  if (queryTimeoutSec <= 0) return 0; // unlimited (client treats 0 as no AbortSignal cap when wired)
  return queryTimeoutSec * 1000;
}

export const useDataClient = (options: DataClientOptions = {}): DataClient => {
  const { data: me } = api.useMe();
  const queryTimeout = me?.team?.queryTimeout ?? DEFAULT_QUERY_TIMEOUT;
  const surfaceAttribution = useQueryAttribution();
  const attribution = mergeQueryAttribution(
    surfaceAttribution,
    options.attribution,
  );
  return getDataClient({
    ...options,
    requestTimeout: queryTimeoutToRequestTimeoutMs(queryTimeout),
    attribution,
  });
};

export function useDatabasesDirect(
  { connectionId }: { connectionId: string },
  options?: Omit<UseQueryOptions<ResponseJSON<ColumnMeta>, Error>, 'queryKey'>,
) {
  const client = getDataClient({
    attribution: useMetadataQueryAttribution(),
  });
  return useQuery<ResponseJSON<ColumnMeta>, Error>({
    queryKey: [`direct_datasources/databases`, connectionId],
    queryFn: async () => {
      const json = await client
        .query({
          query:
            'SELECT RAW name FROM system:keyspaces WHERE `namespace` = "bucket"',
          connectionId,
        })
        .then(res => res.json<ResponseJSON<{ name: string }>>());
      const rows: Array<{ name: string } | string> = Array.isArray(json)
        ? (json as unknown as Array<string | { name: string }>)
        : (json.data as unknown as Array<string | { name: string }>);
      return {
        ...(Array.isArray(json) ? {} : json),
        data: rows.map(row => ({
          name: String(typeof row === 'string' ? row : row.name),
          type: 'String',
        })),
        meta: [{ name: 'name', type: 'String' }],
      } as ResponseJSON<ColumnMeta>;
    },
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function useTablesDirect(
  { database, connectionId }: { database: string; connectionId: string },
  options?: Omit<UseQueryOptions<ResponseJSON<ColumnMeta>, Error>, 'queryKey'>,
) {
  const client = getDataClient({
    attribution: useMetadataQueryAttribution(),
  });
  return useQuery<ResponseJSON<ColumnMeta>, Error>({
    queryKey: [`direct_datasources/databases/${database}/tables`, connectionId],
    queryFn: async () => {
      const json = await client
        .query({
          query:
            'SELECT RAW c.name FROM system:keyspaces c WHERE c.`bucket` = $bucket AND c.`namespace` = "collection"',
          query_params: { bucket: database },
          connectionId,
        })
        .then(res => res.json<ResponseJSON<{ name: string }>>());
      const rows: Array<{ name: string } | string> = Array.isArray(json)
        ? (json as unknown as Array<string | { name: string }>)
        : (json.data as unknown as Array<string | { name: string }>);
      return {
        ...(Array.isArray(json) ? {} : json),
        data: rows.map(row => ({
          name: String(typeof row === 'string' ? row : row.name),
          type: 'String',
        })),
        meta: [{ name: 'name', type: 'String' }],
      } as ResponseJSON<ColumnMeta>;
    },
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}
