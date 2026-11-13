import type { SqlPP } from '@/couchbase/sqlpp';
import { CouchbaseNotReadyError } from '@/dataLayer/errors';
import type { BuilderChartConfigWithOptDateRange } from '@/types';

/** Series-limit CTE; required for charts slice, not search. */
export async function renderSeriesLimitCteCouchbase(
  chartConfig: BuilderChartConfigWithOptDateRange,
  _metadata: unknown,
  _parts: { from: SqlPP; where?: SqlPP; groupBy?: SqlPP },
): Promise<{ cte: SqlPP; predicate: SqlPP } | undefined> {
  if (chartConfig.seriesLimit != null) {
    throw new CouchbaseNotReadyError('charts: seriesLimit');
  }
  return undefined;
}
