import { SourceKind, TSource } from '@couchbase-traces/common-utils/dist/types';

import type { ISource } from '@/metadata/schemas/source';

/** Cast a Mongo source to `TSource` when its kind is queryable (not legacy PromQL). */
export function toQueryableTSource(source: ISource): TSource {
  if (source.kind === SourceKind.Promql) {
    throw new Error('PromQL sources are not queryable');
  }
  return source as unknown as TSource;
}
