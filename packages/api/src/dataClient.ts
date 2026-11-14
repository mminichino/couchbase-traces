import type { CouchbaseConnectionConfig } from '@couchbase-traces/common-utils/dist/couchbase/node';
import type { DataClientOptions } from '@couchbase-traces/common-utils/dist/dataLayer';
import { NodeDataClient } from '@couchbase-traces/common-utils/dist/dataLayer/node';
import type { TeamQuerySettings } from '@couchbase-traces/common-utils/dist/types';

let loadCouchbaseConnection: (
  id: string,
) => Promise<CouchbaseConnectionConfig> = async id => {
  throw new Error(`Couchbase connection loader is not registered (${id})`);
};

export function setCouchbaseConnectionLoader(
  loader: (id: string) => Promise<CouchbaseConnectionConfig>,
): void {
  loadCouchbaseConnection = loader;
}

export class DataClient extends NodeDataClient {
  constructor(
    options: DataClientOptions & { team?: TeamQuerySettings | null },
  ) {
    super({
      ...options,
      loadCouchbaseConnection: id => loadCouchbaseConnection(id),
      team: options.team,
    });
  }
}
