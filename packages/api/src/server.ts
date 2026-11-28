import '@/dataLayerSetup'; // registers Couchbase connection loader (MockServer + prod)

import { clusterCache } from '@couchbase-traces/common-utils/dist/couchbase/node';
import { shutdown as shutdownTelemetry } from '@couchbase-traces/otel-node';
import http from 'http';
import gracefulShutdown from 'http-graceful-shutdown';
import { serializeError } from 'serialize-error';

import app from '@/api-app';
import * as config from '@/config';
import { LOCAL_APP_TEAM } from '@/controllers/team';
import {
  assertMetadataConfig,
  closeMetadataStore,
  startMetadataStore,
} from '@/metadata';
import opampApp from '@/opamp/app';
import { setupTeamDefaults } from '@/setupDefaults';
import logger from '@/utils/logger';
import { runOnceAfterAll } from '@/utils/runOnceAfterAll';
import { verifySessionSecret } from '@/utils/sessionSecret';
import { verifyTokenEncryption } from '@/utils/tokenEncryption';

export default class Server {
  protected shouldHandleGracefulShutdown = true;

  protected appServer!: http.Server;
  protected opampServer!: http.Server;

  private createAppServer() {
    return http.createServer(app);
  }

  private createOpampServer() {
    return http.createServer(opampApp);
  }

  protected async shutdown(_signal?: string) {
    let hasError = false;
    logger.info('Closing all db clients...');
    const [couchbaseCloseResult, metadataCloseResult] =
      await Promise.allSettled([clusterCache.closeAll(), closeMetadataStore()]);

    if (metadataCloseResult.status === 'rejected') {
      hasError = true;
      logger.error(
        { err: serializeError(metadataCloseResult.reason) },
        'Metadata cluster close failed',
      );
    }

    if (couchbaseCloseResult.status === 'rejected') {
      hasError = true;
      logger.error(
        { err: serializeError(couchbaseCloseResult.reason) },
        'Couchbase cluster close failed',
      );
    }

    if (hasError) {
      throw new Error('Failed to close all clients.');
    }
  }

  async start() {
    this.appServer = this.createAppServer();
    this.appServer.keepAliveTimeout = 61000; // Ensure all inactive connections are terminated by the ALB, by setting this a few seconds higher than the ALB idle timeout
    this.appServer.headersTimeout = 62000; // Ensure the headersTimeout is set higher than the keepAliveTimeout due to this nodejs regression bug: https://github.com/nodejs/node/issues/27363

    this.opampServer = this.createOpampServer();
    this.opampServer.keepAliveTimeout = 61000;
    this.opampServer.headersTimeout = 62000;

    this.appServer.listen(config.PORT, () => {
      logger.info(
        `API Server listening on port ${config.PORT}, NODE_ENV=${process.env.NODE_ENV}`,
      );
    });

    this.opampServer.listen(config.OPAMP_PORT, () => {
      logger.info(
        `OpAMP Server listening on port ${config.OPAMP_PORT}, NODE_ENV=${process.env.NODE_ENV}`,
      );
    });

    if (this.shouldHandleGracefulShutdown) {
      const servers = [this.appServer, this.opampServer];
      // Each server's forceExit calls process.exit() once its own onShutdown
      // settles, so both wait here: telemetry stops once, after the slower
      // server has drained, and neither exits before then.
      const shutdownTelemetryOnce = runOnceAfterAll(servers.length, () =>
        shutdownTelemetry(),
      );
      servers.forEach(server => {
        gracefulShutdown(server, {
          signals: 'SIGINT SIGTERM',
          timeout: 10000, // 10 secs
          development: config.IS_DEV,
          forceExit: true, // triggers process.exit() at the end of shutdown process
          preShutdown: async () => {
            // needed operation before httpConnections are shutted down
          },
          onShutdown: async signal => {
            try {
              await this.shutdown(signal);
              // Logged here rather than in the `finally` option, which runs
              // after the SDK has stopped and so would not be exported.
              logger.info('Server gracefully shut down...');
            } finally {
              // forceExit calls process.exit(), which skips the SDK's own
              // exit-time flush. Before init (no key set) this resolves at
              // once.
              await shutdownTelemetryOnce();
            }
          },
        });
      });
    }

    // Checked before the metadata connect so a bad encryption key or KMS
    // policy is reported even while that connect is still retrying.
    await verifyTokenEncryption();
    verifySessionSecret();
    // All app metadata (sessions, users, teams, ...) lives in the metadata
    // bucket; fail fast on missing or malformed CBT_METADATA_* settings.
    assertMetadataConfig();

    // The HTTP servers above are already listening so that `/health`
    // (liveness) responds while we connect; `/ready` (readiness) stays 503
    // until the metadata store is ready. Retries the connection forever, so a
    // Couchbase that comes up after the API does not leave the process running
    // but permanently unable to serve; rejects on bad config (including
    // missing CBT_METADATA_USER / CBT_METADATA_PASSWORD) or a newer schema.
    await startMetadataStore({ logger, appVersion: config.CODE_VERSION });

    // Initialize default connections and sources for local app mode
    if (config.IS_LOCAL_APP_MODE) {
      try {
        logger.info(
          'Local app mode detected, setting up default connections and sources...',
        );
        await setupTeamDefaults(LOCAL_APP_TEAM._id.toString());
        logger.info(
          'Default connections and sources setup completed for local app mode',
        );
      } catch (error) {
        logger.error(
          { err: serializeError(error) },
          'Failed to setup team defaults for local app mode',
        );
        // Don't throw - allow server to start even if defaults setup fails
      }
    }
  }
}
