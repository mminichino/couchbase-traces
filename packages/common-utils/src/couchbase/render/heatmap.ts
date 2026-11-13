import { CouchbaseNotReadyError } from '@/dataLayer/errors';

export function assertHeatmapSupported(): void {
  throw new CouchbaseNotReadyError('charts: heatmap');
}
