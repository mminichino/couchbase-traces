import type { Cluster, ISearchIndex } from 'couchbase';

import { COLLECTIONS, searchDefinitionWithReplicas } from '@/model/collections';

export async function ensureSearchIndexes(
  cluster: Cluster,
  opts: {
    bucket: string;
    scope: string;
    replicas: number;
    log: (line: string) => void;
  },
): Promise<void> {
  const manager = cluster.bucket(opts.bucket).scope(opts.scope).searchIndexes();
  for (const spec of COLLECTIONS) {
    if (!spec.search) continue;
    const definition = searchDefinitionWithReplicas(spec.search, opts.replicas);
    let current: { uuid?: string; sourceUuid?: string } | undefined;
    try {
      current = await manager.getIndex(spec.search.name);
    } catch {
      current = undefined;
    }
    const index = {
      ...definition,
      sourceUuid: current?.sourceUuid ?? '',
      sourceParams: {},
      ...(current?.uuid ? { uuid: current.uuid } : {}),
    } as ISearchIndex;
    try {
      await manager.upsertIndex(index);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!current && /already exists/i.test(message)) {
        opts.log(`exists search ${spec.search.name}`);
        continue;
      }
      throw err;
    }
    opts.log(`${current ? 'exists' : 'created'} search ${spec.search.name}`);
  }
}
