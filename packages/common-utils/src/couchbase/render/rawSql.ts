import { CouchbaseNotReadyError } from '@/dataLayer/errors';
import type { ChartConfigWithOptDateRangeEx } from '@/core/renderChartConfig';
export async function renderRawSqlChartConfigCouchbase(
  _config: ChartConfigWithOptDateRangeEx,
  _metadata: unknown,
): Promise<{ sql: string; params: Record<string, unknown>; dialect: 'sqlpp' }> {
  throw new CouchbaseNotReadyError('charts: rawSql');
}
