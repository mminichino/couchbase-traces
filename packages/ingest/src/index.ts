import { CollectionNotFoundError } from 'couchbase';

import { connectCluster, loadConfig } from '@/config';
import { COLLECTIONS } from '@/model/collections';
import { createIngestApp } from '@/server';
import { type Logger, Writer } from '@/writer';

const logger: Logger = {
  debug: (obj, msg) => console.debug(msg ?? '', obj),
  info: (obj, msg) => console.info(msg ?? '', obj),
  warn: (obj, msg) => console.warn(msg ?? '', obj),
  error: (obj, msg) => console.error(msg ?? '', obj),
};

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  const cluster = await connectCluster(config);
  const scope = cluster.bucket(config.bucket).scope(config.scope);
  for (const spec of COLLECTIONS) {
    try {
      await scope.collection(spec.name).exists('__cbt_probe__');
    } catch (err) {
      if (
        err instanceof CollectionNotFoundError ||
        nameOf(err) === 'CollectionNotFoundError'
      ) {
        console.error(
          `Collection ${spec.name} missing; run the setup command.`,
        );
        process.exit(1);
      }
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    }
  }

  const writer = new Writer({
    scope,
    concurrency: config.kvConcurrency,
    timeoutMs: config.kvTimeoutMs,
    maxDocBytes: config.maxDocBytes,
    ttl: config.ttl,
    logger,
  });
  const app = createIngestApp({
    config,
    writer,
    ready: async () => {
      try {
        await scope.collection(COLLECTIONS[0].name).exists('__cbt_probe__', {
          timeout: 2000,
        });
        return true;
      } catch {
        return false;
      }
    },
  });

  await new Promise<void>(resolve => {
    app.server.listen(config.port, config.host, () => resolve());
  });
  logger.info({ port: config.port, host: config.host }, 'ingest listening');

  let stopping = false;
  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    const timer = setTimeout(() => process.exit(0), 25_000);
    app.server.close(() => {
      cluster
        .close()
        .catch(() => undefined)
        .finally(() => {
          clearTimeout(timer);
          process.exit(0);
        });
    });
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

function nameOf(err: unknown): string {
  return err instanceof Error ? err.name : '';
}

void main();
