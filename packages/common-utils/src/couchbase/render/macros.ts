import { CouchbaseNotReadyError } from '@/dataLayer/errors';

export function expandMacroCouchbase(_name: string): never {
  throw new CouchbaseNotReadyError('charts: macros');
}
