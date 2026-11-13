import type {
  ClickhouseClientOptions,
  Logger as ClickhouseLogger,
} from '@couchbase-traces/common-utils/dist/clickhouse';
import type { CouchbaseConnectionConfig } from '@couchbase-traces/common-utils/dist/couchbase/node';
import { RoutingNodeClickhouseClient } from '@couchbase-traces/common-utils/dist/dataLayer/node';
import type { TeamClickHouseSettings } from '@couchbase-traces/common-utils/dist/types';

import logger from '@/utils/logger';

let loadCouchbaseConnection: (
  id: string,
) => Promise<CouchbaseConnectionConfig> = async id => {
  throw new Error(`Couchbase connection loader is not registered (${id})`);
};

/** Registered at process startup so every client can open its Couchbase side. */
export function setCouchbaseConnectionLoader(
  loader: (id: string) => Promise<CouchbaseConnectionConfig>,
): void {
  loadCouchbaseConnection = loader;
}

const customLogger: ClickhouseLogger = {
  trace: ({ module, message, args }) =>
    logger.trace({ ...args, module }, message),
  debug: ({ module, message, args }) =>
    logger.debug({ ...args, module }, message),
  info: ({ module, message, args }) =>
    logger.info({ ...args, module }, message),
  warn: ({ module, message, args, err }) =>
    logger.warn({ ...args, module, err }, message),
  error: ({ module, message, args, err }) =>
    logger.error({ ...args, module, err }, message),
};

export class ClickhouseClient extends RoutingNodeClickhouseClient {
  constructor(
    options: ClickhouseClientOptions & { team?: TeamClickHouseSettings | null },
  ) {
    super({
      ...options,
      customLogger: options.customLogger ?? customLogger,
      // Read through the binding so registration after import still applies.
      loadCouchbaseConnection: id => loadCouchbaseConnection(id),
      team: options.team,
    });
  }
}
