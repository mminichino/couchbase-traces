// D4: an alert on an empty collection ends in OK, not ERROR. Rendering the
// saved search's Lucene filter reads column metadata, and INFER on an empty
// collection fails with 7014; upstream DESCRIBE TABLE on an empty table
// succeeds and the window evaluates with zero rows. Same inputs as the R2b
// checkAlerts saved-search cases (setupSavedSearchAlertTest).
import {
  AlertState,
  AlertThresholdType,
} from '@couchbase-traces/common-utils/dist/types';

import { createAlert } from '@/controllers/alerts';
import { createTeam } from '@/controllers/team';
import { DEFAULT_DATABASE, DEFAULT_LOGS_TABLE, getServer } from '@/fixtures';
import { newId } from '@/metadata/ids';
import { AlertSource } from '@/metadata/schemas/alert';
import { getAlert, listHistory } from '@/metadata/testing/alertFixtures';
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

describe('alerts on an empty collection (D4)', () => {
  const server = getServer();

  beforeAll(async () => {
    await server.start();
  });

  beforeEach(async () => {
    // Empties otel_logs (indexed, so the alert query may scan it), leaving
    // INFER zero documents to sample.
    await server.clearDBs();
    // Notifications must not fire; a stub keeps a failure from reaching Slack.
    jest.spyOn(slack, 'postMessageToWebhook').mockImplementation(jest.fn());
  });

  afterEach(async () => {
    await server.clearDBs();
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await server.stop();
  });

  async function runSavedSearchAlert() {
    const team = await createTeam({ name: 'D4 team' });
    const webhook = await seedWebhook({
      team: team._id,
      service: 'slack',
      url: 'https://hooks.slack.com/services/d4',
      name: 'D4 webhook',
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
      from: { databaseName: DEFAULT_DATABASE, tableName: DEFAULT_LOGS_TABLE },
      timestampValueExpression: 'Timestamp',
      connection: connection.id,
      name: 'Empty logs',
    });
    const savedSearch = await seedSavedSearch({
      team: team._id,
      name: 'D4 search',
      select: 'Body',
      where: 'SeverityText: "error"',
      whereLanguage: 'lucene',
      orderBy: 'Timestamp',
      source: source.id,
      tags: [],
    });
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
    // processAlert takes the stored alert; the saved search is passed apart.
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
    return listHistory(alert.id);
  }

  it('records OK with zero matches for a Lucene saved search', async () => {
    const history = await runSavedSearchAlert();
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ state: AlertState.OK, counts: 0 });
    expect(history[0].errors ?? []).toEqual([]);
    expect(slack.postMessageToWebhook).not.toHaveBeenCalled();
  });
});
