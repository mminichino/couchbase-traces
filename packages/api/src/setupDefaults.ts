import {
  COUCHBASE_LOG_SOURCE,
  COUCHBASE_METRIC_SOURCE,
  COUCHBASE_SESSION_SOURCE,
  COUCHBASE_TRACE_SOURCE,
} from '@couchbase-traces/common-utils/dist/couchbase/defaultSources';
import { SourceKind } from '@couchbase-traces/common-utils/dist/types';

import {
  COUCHBASE_BUCKET,
  COUCHBASE_SCOPE,
  DEFAULT_CONNECTIONS,
  DEFAULT_SOURCES,
  DEFAULT_SOURCES_PRESET,
  IS_PROMQL_ENABLED,
} from '@/config';
import { createConnection, getConnections } from '@/controllers/connection';
import { createSource, getSources, updateSource } from '@/controllers/sources';
import { getTeam } from '@/controllers/team';
import type { ITeam } from '@/metadata/schemas/team';
import logger from '@/utils/logger';

function tryParseJSON(str: string | undefined) {
  try {
    if (str != null) {
      return JSON.parse(str);
    }
  } catch {
    // skip
  }
  return undefined;
}

type TeamConnection = Awaited<ReturnType<typeof getConnections>>[number];

async function seedSourcesFromConfigs(
  teamId: string,
  team: ITeam,
  sourceConfigs: object[],
  teamConnections: TeamConnection[],
) {
  const sourceConfigsByName: { [key: string]: any } = {};
  const createdSources: { [key: string]: any } = {};

  for (const sourceConfig of sourceConfigs) {
    try {
      const config = sourceConfig as {
        name?: string;
        kind?: string;
        connection?: string;
        [key: string]: unknown;
      };
      if (!config.name || !config.kind || !config.connection) {
        logger.warn(
          `Skipping invalid source config: ${JSON.stringify(sourceConfig)}`,
        );
        continue;
      }

      if (config.kind === SourceKind.Promql && !IS_PROMQL_ENABLED) {
        logger.info(
          `Skipping default source ${config.name}: PromQL is disabled`,
        );
        continue;
      }

      sourceConfigsByName[config.name] = sourceConfig;

      let connectionId = config.connection;
      if (
        typeof connectionId === 'string' &&
        !connectionId.match(/^[0-9a-fA-F]{24}$/)
      ) {
        const connection = teamConnections.find(c => c.name === connectionId);
        if (!connection) {
          logger.warn({ connectionId }, 'Connection not found with name');
          continue;
        }
        connectionId = connection._id.toString();
      }

      const sourceConfigCleaned = {
        ...sourceConfig,
        connection: connectionId,
        team: team._id,
      } as Record<string, unknown>;

      delete sourceConfigCleaned.logSourceId;
      delete sourceConfigCleaned.traceSourceId;
      delete sourceConfigCleaned.sessionSourceId;
      delete sourceConfigCleaned.metricSourceId;

      const newSource = await createSource(
        teamId,
        sourceConfigCleaned as Parameters<typeof createSource>[1],
      );

      logger.info(`Created default source: ${config.name} (${newSource._id})`);

      createdSources[config.name] = newSource;
    } catch (error) {
      logger.error({ err: error }, 'Failed to create source');
    }
  }

  for (const sourceName in createdSources) {
    try {
      const sourceConfig = sourceConfigsByName[sourceName];
      const createdSource = createdSources[sourceName];

      const updateFields: { [key: string]: string } = {};

      if (
        sourceConfig.logSourceId &&
        createdSources[sourceConfig.logSourceId]
      ) {
        updateFields.logSourceId =
          createdSources[sourceConfig.logSourceId]._id.toString();
      }

      if (
        sourceConfig.traceSourceId &&
        createdSources[sourceConfig.traceSourceId]
      ) {
        updateFields.traceSourceId =
          createdSources[sourceConfig.traceSourceId]._id.toString();
      }

      if (
        sourceConfig.sessionSourceId &&
        createdSources[sourceConfig.sessionSourceId]
      ) {
        updateFields.sessionSourceId =
          createdSources[sourceConfig.sessionSourceId]._id.toString();
      }

      if (
        sourceConfig.metricSourceId &&
        createdSources[sourceConfig.metricSourceId]
      ) {
        updateFields.metricSourceId =
          createdSources[sourceConfig.metricSourceId]._id.toString();
      }

      if (Object.keys(updateFields).length > 0) {
        await updateSource(teamId, createdSource._id.toString(), {
          ...createdSource,
          ...updateFields,
        });

        logger.info(
          `Updated source ${sourceName} with references: ${JSON.stringify(updateFields)}`,
        );
      }
    } catch (error) {
      logger.error({ err: error }, 'Failed to update source references');
    }
  }
}

function couchbasePresetSourceConfigs(
  bucket: string,
  scope: string,
  connectionId: string,
): object[] {
  const withLocation = (template: {
    from?: { databaseName?: string; scopeName?: string; tableName?: string };
    [key: string]: unknown;
  }) => ({
    ...template,
    connection: connectionId,
    from: template.from
      ? {
          ...template.from,
          databaseName: bucket,
          scopeName: scope,
        }
      : template.from,
  });

  return [
    withLocation(COUCHBASE_LOG_SOURCE),
    withLocation(COUCHBASE_TRACE_SOURCE),
    withLocation(COUCHBASE_METRIC_SOURCE),
    withLocation(COUCHBASE_SESSION_SOURCE),
  ];
}

/**
 * Sets up default connections and sources for a team
 * @param teamId The ID of the team to set up defaults for
 * @returns Promise that resolves when setup is complete
 */
export async function setupTeamDefaults(teamId: string) {
  logger.info(`Setting up defaults for team: ${teamId}`);

  const parsedDefaultConnections = tryParseJSON(DEFAULT_CONNECTIONS);
  const parsedDefaultSources = tryParseJSON(DEFAULT_SOURCES);

  if (
    parsedDefaultConnections == null &&
    parsedDefaultSources == null &&
    DEFAULT_SOURCES_PRESET !== 'couchbase'
  ) {
    logger.info(
      'No DEFAULT_CONNECTIONS or DEFAULT_SOURCES environment variables defined, skipping auto-provisioning',
    );
    return;
  }

  const team = await getTeam(teamId);
  if (!team) {
    logger.warn({ teamId }, 'Team not found');
    return;
  }

  const connections = await getConnections();
  const teamConnections = connections.filter(c => c.team.toString() === teamId);

  if (teamConnections.length === 0 && Array.isArray(parsedDefaultConnections)) {
    logger.info(
      `No connections found for team ${teamId}, creating default connections`,
    );

    for (const connectionConfig of parsedDefaultConnections) {
      try {
        if (!connectionConfig.name || !connectionConfig.host) {
          logger.warn(
            `Skipping invalid connection config: ${JSON.stringify(connectionConfig)}`,
          );
          continue;
        }

        const newConnection = await createConnection(teamId, {
          ...connectionConfig,
          password: connectionConfig.password || '',
          team: team._id,
        });

        logger.info(
          `Created default connection: ${connectionConfig.name} (${newConnection._id})`,
        );
      } catch (error) {
        logger.error({ err: error }, 'Failed to create connection');
      }
    }
  } else if (parsedDefaultConnections) {
    logger.info(
      `Connections already exist for team ${teamId}, skipping default connection creation`,
    );
  }

  const sources = await getSources(teamId);

  if (sources.length === 0) {
    const updatedConnections = await getConnections();
    const teamUpdatedConnections = updatedConnections.filter(
      c => c.team.toString() === teamId,
    );

    if (teamUpdatedConnections.length === 0) {
      logger.warn(
        `Cannot create default sources: no connections available for team ${teamId}`,
      );
      return;
    }

    if (DEFAULT_SOURCES != null) {
      if (DEFAULT_SOURCES_PRESET) {
        logger.info(
          'DEFAULT_SOURCES is set; ignoring CBT_DEFAULT_SOURCES_PRESET',
        );
      }
      if (Array.isArray(parsedDefaultSources)) {
        logger.info(
          `No sources found for team ${teamId}, creating default sources`,
        );
        await seedSourcesFromConfigs(
          teamId,
          team,
          parsedDefaultSources,
          teamUpdatedConnections,
        );
      }
    } else if (DEFAULT_SOURCES_PRESET === 'couchbase') {
      const couchbaseConnection = teamUpdatedConnections.find(
        c => c.kind === 'couchbase',
      );
      if (!couchbaseConnection) {
        logger.error(
          'CBT_DEFAULT_SOURCES_PRESET=couchbase but no Couchbase connection exists for this team; skipping default source seeding',
        );
        return;
      }

      logger.info(
        `No sources found for team ${teamId}, creating Couchbase preset sources`,
      );

      const presetConfigs = couchbasePresetSourceConfigs(
        COUCHBASE_BUCKET,
        COUCHBASE_SCOPE,
        couchbaseConnection._id.toString(),
      );
      await seedSourcesFromConfigs(
        teamId,
        team,
        presetConfigs,
        teamUpdatedConnections,
      );
    }
  } else if (parsedDefaultSources || DEFAULT_SOURCES_PRESET === 'couchbase') {
    logger.info(
      `Sources already exist for team ${teamId}, skipping default source creation`,
    );
  }
}
