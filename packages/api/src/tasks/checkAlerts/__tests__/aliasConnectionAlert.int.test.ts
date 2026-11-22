// D6: the notification's sample rows render the saved search's Lucene filter,
// which reads column metadata, and on Couchbase every read needs the source's
// connection id. The task rendered that config with `connection: ''`, so the
// sample query threw and the message went out with no rows. Inputs follow the
// R2b checkAlerts saved-search cases; the alias form ("alias in select and
// where") also needs SQL++ alias WITH clauses (D11).
import { AlertThresholdType } from '@couchbase-traces/common-utils/dist/types';

import { createAlert } from '@/controllers/alerts';
import { createTeam } from '@/controllers/team';
import { bulkInsertLogs, DEFAULT_DATABASE, getServer } from '@/fixtures';
import { newId } from '@/metadata/ids';
import { AlertSource } from '@/metadata/schemas/alert';
import { getAlert } from '@/metadata/testing/alertFixtures';
import {
  seedConnection,
  seedSavedSearch,
  seedSource,
  seedWebhook,
} from '@/metadata/testing/seed';
import { DataClient } from '@/query';
import {
  getConsecutiveWindowHistories,
  getPreviousAlertHistories,
  processAlert,
} from '@/tasks/checkAlerts';
import { AlertTaskType, loadProvider } from '@/tasks/checkAlerts/providers';
import { TEST_COUCHBASE_CONNECTION } from '@/testCouchbaseConnection';
import * as slack from '@/utils/slack';

describe('saved-search alert notification sample rows (D6)', () => {
  const server = getServer();

  beforeAll(async () => {
    await server.start();
  });

  beforeEach(async () => {
    await server.clearDBs();
    jest.spyOn(slack, 'postMessageToWebhook').mockImplementation(jest.fn());
  });

  afterEach(async () => {
    await server.clearDBs();
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await server.stop();
  });

  it('triggers and quotes the matching rows in the notification', async () => {
    const team = await createTeam({ name: 'D6 team' });
    const webhook = await seedWebhook({
      team: team._id,
      service: 'slack',
      url: 'https://hooks.slack.com/services/d6',
      name: 'D6 webhook',
    });
    const connection = await seedConnection({
      host: TEST_COUCHBASE_CONNECTION.host,
      kind: 'couchbase',
      team: team._id,
      name: 'Default',
      username: TEST_COUCHBASE_CONNECTION.username,
      password: TEST_COUCHBASE_CONNECTION.password,
    });
    const source = await seedSource({
      kind: 'log',
      team: team._id,
      from: { databaseName: DEFAULT_DATABASE, tableName: 'otel_logs' },
      timestampValueExpression: 'Timestamp',
      connection: connection.id,
      name: 'Logs',
    });
    const savedSearch = await seedSavedSearch({
      team: team._id,
      name: 'Error Search',
      select: 'Body',
      where: 'SeverityText:error',
      whereLanguage: 'lucene',
      orderBy: 'Timestamp',
      source: source.id,
      tags: ['test'],
    });

    const eventMs = new Date('2023-11-16T22:05:00.000Z');
    await bulkInsertLogs([
      {
        ServiceName: 'api',
        Timestamp: eventMs,
        SeverityText: 'error',
        Body: 'Oh no! Something went wrong!',
      },
      {
        ServiceName: 'api',
        Timestamp: eventMs,
        SeverityText: 'error',
        Body: 'Retry limit exceeded',
      },
      {
        ServiceName: 'api',
        Timestamp: eventMs,
        SeverityText: 'info',
        Body: 'All good',
      },
    ]);

    const alert = await createAlert(
      team._id,
      {
        source: AlertSource.SAVED_SEARCH,
        channel: { type: 'webhook', webhookId: webhook._id.toString() },
        interval: '5m',
        thresholdType: AlertThresholdType.ABOVE,
        threshold: 1,
        savedSearchId: savedSearch.id,
      },
      newId(),
    );
    const stored = await getAlert(alert.id);
    if (!stored) throw new Error('alert not found after create');
    const now = new Date('2023-11-16T22:12:00.000Z');
    const [previousMap, recentHistoryMap] = await Promise.all([
      getPreviousAlertHistories([alert.id], now),
      getConsecutiveWindowHistories([stored], now),
    ]);
    await processAlert(
      now,
      {
        alert: stored,
        source,
        taskType: AlertTaskType.SAVED_SEARCH,
        savedSearch,
        previousMap,
        recentHistoryMap,
      },
      new DataClient({}),
      connection.id,
      await loadProvider(),
      new Map([[webhook._id.toString(), webhook]]),
    );

    expect((await getAlert(alert.id))!.state).toBe('ALERT');
    expect(slack.postMessageToWebhook).toHaveBeenCalledTimes(1);
    const [, message] = jest.mocked(slack.postMessageToWebhook).mock.calls[0];
    const text = JSON.stringify(message);
    expect(text).toContain('Oh no! Something went wrong!');
    expect(text).toContain('Retry limit exceeded');
    expect(text).not.toContain('All good');
  });
});
