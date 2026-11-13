import { CouchbaseNotReadyError } from '@/dataLayer/errors';

export async function renderMultiSeriesMetricChartConfigCouchbase(): Promise<never> {
  throw new CouchbaseNotReadyError('metrics: multiSeries');
}
