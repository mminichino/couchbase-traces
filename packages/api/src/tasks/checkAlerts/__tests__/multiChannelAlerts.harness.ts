import ms from 'ms';

import * as config from '@/config';
import { bulkInsertLogs } from '@/fixtures';
import { IWebhook } from '@/metadata/schemas/webhook';
import {
  seedConnection,
  seedSavedSearch,
  seedSource,
  seedWebhook,
} from '@/metadata/testing/seed';
import Alert from '@/metadata/schemas/alert';
import { DataClient } from '@/query';
import { processAlert } from '@/tasks/checkAlerts';
import { AlertTaskType } from '@/tasks/checkAlerts/providers';

// Shared setup for the multi-channel dispatch scenarios. Kept out of the spec
// so each file stays under the repo's file-size limit and the scenarios read as
// scenarios.

export const HOOK_A = 'https://webhook.site/hook-a';
export const HOOK_B = 'https://webhook.site/hook-b';
export const HOOK_OK = 'https://webhook.site/hook-ok';
export const HOOK_BAD = 'https://webhook.site/hook-bad';

const NOW = new Date('2023-11-16T22:12:00.000Z');

/**
 * Route the stubbed global fetch (see jest.setup.ts) by URL so each target can
 * succeed or fail independently. Returns the URLs it was called with.
 */
export const installFetchRouter = () => {
  const requestedUrls: string[] = [];
  jest.mocked(global.fetch).mockImplementation(async input => {
    const url = String(input);
    requestedUrls.push(url);
    if (url === HOOK_BAD) {
      // 400 rather than 500 so withRetry does not retry — keeps it fast.
      return new Response('nope', { status: 400 });
    }
    return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
  });
  return requestedUrls;
};

export const setupAlertFixtures = async (
  createTeam: (args: { name: string }) => Promise<any>,
) => {
  const team = await createTeam({ name: 'Test Team' });
  const connection = await seedConnection({
    host: config.CLICKHOUSE_HOST,
    kind: 'couchbase',
    team: team._id,
    name: 'Test Connection',
    username: config.CLICKHOUSE_USER,
    password: config.CLICKHOUSE_PASSWORD,
  });
  const source = await seedSource({
    kind: 'log',
    team: team._id,
    from: { databaseName: 'otel', tableName: 'otel_logs' },
    timestampValueExpression: 'Timestamp',
    connection: connection.id,
    name: 'Test Logs',
  });
  const savedSearch = await seedSavedSearch({
    team: team._id,
    name: 'Error Logs Search',
    select: 'Body',
    where: 'SeverityText: "error"',
    whereLanguage: 'lucene',
    orderBy: 'Timestamp',
    source: source.id,
    tags: ['test'],
  });
  return { team, connection, source, savedSearch };
};

export const makeGenericWebhook = (teamId: any, name: string, url: string) =>
  seedWebhook({
    team: teamId,
    service: 'generic',
    url,
    name,
    body: JSON.stringify({ text: '{{title}}' }),
  });

export const seedTriggeringLogs = async () => {
  const eventTime = new Date(NOW.getTime() - ms('3m'));
  await bulkInsertLogs([
    {
      ServiceName: 'api',
      Timestamp: eventTime,
      SeverityText: 'error',
      Body: 'Test error message',
    },
    {
      ServiceName: 'api',
      Timestamp: eventTime,
      SeverityText: 'error',
      Body: 'Test error message',
    },
  ]);
};

export const runAlert = async ({
  alertId,
  alertProvider,
  connection,
  source,
  savedSearch,
  webhooks,
}: {
  alertId: string;
  alertProvider: any;
  connection: any;
  source: any;
  savedSearch: any;
  webhooks: IWebhook[];
}) => {
  const enhancedAlert: any = await Alert.findById(alertId).populate([
    'team',
    'savedSearch',
  ]);
  const details: any = {
    alert: enhancedAlert,
    source,
    conn: connection,
    taskType: AlertTaskType.SAVED_SEARCH,
    savedSearch,
    previousMap: new Map(),
  };
  const dataClient = new DataClient({});
  await processAlert(
    NOW,
    details,
    dataClient,
    connection.id,
    alertProvider,
    new Map(webhooks.map(w => [w._id.toString(), w])),
  );
  return Alert.findById(alertId);
};
