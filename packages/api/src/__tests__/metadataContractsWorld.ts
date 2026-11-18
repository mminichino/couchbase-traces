// Seeds one team's worth of metadata through the internal API, so the C0
// wire-contract snapshots do not depend on how any backend stores it. Every
// create response is recorded too: those are part of the contract.
import { COUCHBASE_LOG_SOURCE } from '@couchbase-traces/common-utils/dist/couchbase/defaultSources';
import { WebhookService } from '@couchbase-traces/common-utils/dist/types';
import type { SuperAgentTest } from 'supertest';

import {
  getLoggedInAgent,
  type getServer,
  makeAlertInput,
  makeSavedSearchAlertInput,
  makeTile,
} from '@/fixtures';

type MockServer = ReturnType<typeof getServer>;

export interface ContractWorld {
  agent: SuperAgentTest;
  accessKey: string;
  teamId: string;
  userId: string;
  ids: {
    connection: string;
    source: string;
    webhook: string;
    savedSearch: string;
    dashboard: string;
    tile: string;
    tileAlert: string;
    savedSearchAlert: string;
  };
  /** Create responses, keyed by route, in creation order. */
  created: Record<string, unknown>;
}

const CONNECTION = {
  name: 'Contract connection',
  host: 'couchbase://127.0.0.1',
  username: 'cbt_query',
  password: 'dev-query-password',
  kind: 'couchbase',
};

const WEBHOOK = {
  name: 'Contract webhook',
  service: WebhookService.Slack,
  url: 'https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX',
  description: 'Contract snapshot webhook',
  queryParams: { param1: 'value1' },
  headers: { 'X-Custom-Header': 'Header Value' },
  body: '{"text": "Contract message"}',
};

export async function seedContractWorld(
  server: MockServer,
): Promise<ContractWorld> {
  const { agent, team, user } = await getLoggedInAgent(server);
  const created: Record<string, unknown> = {};
  const post = async (
    path: string,
    body: object,
    method: 'post' | 'put' = 'post',
  ) => {
    const req = method === 'put' ? agent.put(path) : agent.post(path);
    const res = await req.send(body);
    if (res.status !== 200) {
      throw new Error(
        `seed ${method} ${path}: ${res.status} ${JSON.stringify(res.body)}`,
      );
    }
    created[`${method.toUpperCase()} ${path}`] = res.body;
    return res.body;
  };

  const connection = await post('/connections', CONNECTION);
  const source = await post('/sources', {
    ...COUCHBASE_LOG_SOURCE,
    name: 'Contract logs',
    connection: connection.id,
    from: { ...COUCHBASE_LOG_SOURCE.from, databaseName: 'otel' },
  });
  const webhook = (await post('/webhooks', WEBHOOK)).data;
  const savedSearch = await post('/saved-search', {
    name: 'Contract errors',
    select: 'Timestamp, ServiceName, Body',
    where: 'SeverityText:error',
    whereLanguage: 'lucene',
    source: source.id,
    orderBy: 'Timestamp DESC',
    tags: ['contract'],
  });
  const tiles = [makeTile({ sourceId: source.id }), makeTile()];
  const dashboard = await post('/dashboards', {
    name: 'Contract dashboard',
    tiles,
    tags: ['contract'],
  });
  const tileAlert = (
    await post(
      '/alerts',
      makeAlertInput({
        dashboardId: dashboard.id,
        tileId: tiles[0].id,
        webhookId: webhook._id ?? webhook.id,
        displayName: 'Contract tile alert',
      }),
    )
  ).data;
  delete created['POST /alerts'];
  created['POST /alerts (tile)'] = { data: tileAlert };
  const savedSearchAlert = (
    await post(
      '/alerts',
      makeSavedSearchAlertInput({
        savedSearchId: savedSearch._id ?? savedSearch.id,
        webhookId: webhook._id ?? webhook.id,
      }),
    )
  ).data;
  delete created['POST /alerts'];
  created['POST /alerts (saved search)'] = { data: savedSearchAlert };
  await post(
    '/favorites',
    { resourceType: 'dashboard', resourceId: dashboard.id },
    'put',
  );
  await post(
    '/pinned-filters',
    {
      source: source.id,
      fields: ['ServiceName'],
      filters: { ServiceName: ['web'] },
    },
    'put',
  );
  await post('/team/invitation', {
    email: 'invitee@example.com',
    name: 'Invitee',
  });

  return {
    agent,
    accessKey: String(user.accessKey),
    teamId: team._id.toString(),
    userId: user._id.toString(),
    ids: {
      connection: connection.id,
      source: source.id,
      webhook: webhook._id ?? webhook.id,
      savedSearch: savedSearch._id ?? savedSearch.id,
      dashboard: dashboard.id,
      tile: tiles[0].id,
      tileAlert: tileAlert._id ?? tileAlert.id,
      savedSearchAlert: savedSearchAlert._id ?? savedSearchAlert.id,
    },
    created,
  };
}
