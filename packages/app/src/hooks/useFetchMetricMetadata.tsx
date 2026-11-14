import {
  ResponseJSON,
  sqlExpr,
  tableExpr,
} from '@couchbase-traces/common-utils/dist/query';
import {
  SourceKind,
  TMetricSource,
} from '@couchbase-traces/common-utils/dist/types';
import { useQuery } from '@tanstack/react-query';

import { getDataClient } from '@/query';
import { useMetadataQueryAttribution } from '@/queryAttribution';
import { getMetricTableName } from '@/utils';

export interface MetricMetadata {
  unit: string;
  description: string;
}

interface MetricMetadataProps {
  databaseName: string;
  metricType?: string;
  metricName?: string;
  tableSource: TMetricSource | undefined;
}

interface MetricMetadataResponse {
  MetricUnit: string;
  MetricDescription: string;
}

export const useFetchMetricMetadata = ({
  databaseName,
  metricType,
  metricName,
  tableSource,
}: MetricMetadataProps) => {
  const tableName = tableSource
    ? (getMetricTableName(tableSource, metricType) ?? '')
    : '';

  const shouldFetch = Boolean(
    databaseName &&
      metricType &&
      metricName &&
      tableSource &&
      tableName &&
      tableSource?.kind === SourceKind.Metric,
  );

  const attribution = useMetadataQueryAttribution();

  return useQuery({
    queryKey: ['metric-metadata', databaseName, metricType, metricName],
    queryFn: async ({ signal }) => {
      if (!shouldFetch || !metricName) {
        return null;
      }

      const dataClient = getDataClient({ attribution });
      const sql = sqlExpr`
        SELECT
          MetricUnit,
          MetricDescription
        FROM ${tableExpr({ database: databaseName, table: tableName })}
        WHERE MetricName = ${{ String: metricName }}
        LIMIT 1
      `;

      const result = (await dataClient
        .query<'JSON'>({
          query: sql.sql,
          query_params: sql.params,
          format: 'JSON',
          abort_signal: signal,
          connectionId: tableSource!.connection,
        })
        .then(res => res.json())) as ResponseJSON<MetricMetadataResponse>;

      if (result?.data?.[0]) {
        return {
          unit: result.data[0].MetricUnit || '',
          description: result.data[0].MetricDescription || '',
        };
      }

      return null;
    },
    enabled: shouldFetch,
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
};
