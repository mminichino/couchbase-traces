import { DisplayType } from '@couchbase-traces/common-utils/dist/types';

import { newId } from '@/metadata/ids';
import { AlertState } from '@/metadata/schemas/alert';
import type { IAlertHistory } from '@/metadata/schemas/alertHistory';
import { processAlert } from '@/tasks/checkAlerts';
import {
  clearAlertEvaluators,
  registerAlertEvaluator,
} from '@/tasks/checkAlerts/evaluators';
import { AlertTaskType } from '@/tasks/checkAlerts/providers';

// D12: one evaluation's history rows share createdAt, so their write order is
// their read order. It must not follow the order the data store happened to
// return a bucket's groups in (SQL++ GROUP BY output order is unspecified).

const NOW = new Date('2023-11-16T22:12:00.000Z');

const makeAlert = (): any => ({
  id: newId(),
  interval: '5m',
  threshold: 1,
  thresholdType: 'above',
  channel: { type: 'webhook' },
  source: 'tile',
});

// A raw SQL Line chart is grouped (any non-value, non-time column is a group
// key) and reaches the threshold path without a source.
const makeDetails = (alert: any): any => ({
  alert,
  previousMap: new Map(),
  taskType: AlertTaskType.INLINE,
  chartConfig: {
    configType: 'sql',
    sqlTemplate: 'SELECT 1',
    displayType: DisplayType.Line,
  },
});

const makeProvider = (): any => ({
  updateAlertState: jest.fn().mockResolvedValue(undefined),
  recordAlertErrors: jest.fn().mockResolvedValue(undefined),
});

const writtenGroups = (provider: any): (string | undefined)[] =>
  (provider.updateAlertState.mock.calls[0][1] as IAlertHistory[]).map(
    h => h.group,
  );

describe('history write order (D12)', () => {
  afterEach(() => {
    clearAlertEvaluators();
  });

  it('writes a bucket’s groups in group order, not query row order', async () => {
    const bucket = '2023-11-16T22:05:00.000Z';
    const client: any = {
      requestTimeoutMs: 1000,
      queryChartConfig: jest.fn().mockResolvedValue({
        // The order the INLINE "notifies per group" case flaked on.
        data: [
          { ts: bucket, ServiceName: 'worker', count: 2 },
          { ts: bucket, ServiceName: 'api', count: 3 },
        ],
        meta: [
          { name: 'ts', type: 'DateTime64(9)' },
          { name: 'ServiceName', type: 'String' },
          { name: 'count', type: 'UInt64' },
        ],
      }),
    };
    const provider = makeProvider();
    await processAlert(
      NOW,
      makeDetails(makeAlert()),
      client,
      'connection-1',
      provider,
      new Map(),
    );

    expect(writtenGroups(provider)).toEqual([
      'ServiceName:api',
      'ServiceName:worker',
    ]);
  });

  it('writes an evaluator’s rows in group order', async () => {
    registerAlertEvaluator({
      name: 'custom',
      appliesTo: () => true,
      evaluate: async ctx => {
        const rows = ['b', 'c', 'a', ''].map(g => {
          const h = ctx.getOrCreateHistory(g);
          h.state = AlertState.OK;
          return h;
        });
        await ctx.persistHistories(rows);
      },
    });
    const provider = makeProvider();
    const client: any = { requestTimeoutMs: 1000, queryChartConfig: jest.fn() };
    await processAlert(
      NOW,
      makeDetails(makeAlert()),
      client,
      'connection-1',
      provider,
      new Map(),
    );

    expect(writtenGroups(provider)).toEqual([undefined, 'a', 'b', 'c']);
  });
});
