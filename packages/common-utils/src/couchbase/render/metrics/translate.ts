import { CouchbaseNotReadyError } from '@/dataLayer/errors';

export async function translateMetricChartConfigCouchbase(): Promise<never> {
  throw new CouchbaseNotReadyError('metrics: translate');
}
