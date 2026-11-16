import { renderChartConfig } from '@couchbase-traces/common-utils/dist/dataLayer';
import { ChartConfigWithOptDateRange } from '@couchbase-traces/common-utils/dist/types';
import { useQuery, UseQueryOptions } from '@tanstack/react-query';

import { useDataClient } from '@/query';
import { useSource } from '@/source';

import { useMetadataWithSettings } from './useMetadata';

export function useExplainQuery(
  _config: ChartConfigWithOptDateRange,
  options?: Omit<UseQueryOptions<any>, 'queryKey' | 'queryFn'>,
) {
  const { enabled, ...restOptions } = options ?? {};

  const config = {
    ..._config,
    with: undefined,
  };
  const dataClient = useDataClient();

  const metadata = useMetadataWithSettings();

  const { data: source, isLoading: isSourceLoading } = useSource({
    id: config.source,
  });

  return useQuery({
    queryKey: ['explain', config],
    queryFn: async ({ signal }) => {
      const query = await renderChartConfig(
        config,
        metadata,
        source?.querySettings,
      );
      const response = await dataClient.query<'JSONEachRow'>({
        // Couchbase SQL++ has EXPLAIN, not ClickHouse's EXPLAIN ESTIMATE.
        query: `EXPLAIN ${query.sql}`,
        query_params: query.params,
        format: 'JSONEachRow',
        abort_signal: signal,
        connectionId: config.connection,
      });
      return response.json();
    },
    retry: false,
    staleTime: 1000 * 60,
    enabled: enabled && !isSourceLoading,
    ...restOptions,
  });
}
