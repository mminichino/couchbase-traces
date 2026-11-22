// D7: a metric formula tile with `showOperandSeries: false` returns the
// formula and no operand columns. The result column hints used to list the
// operand aliases, and the result set filled them in as `null`. Inputs and
// assertions follow the deferred `queryTile` case "should save and query a
// metric formula tile"; the operands-shown case pins the other branch.
import {
  MetricsDataType,
  SourceKind,
} from '@couchbase-traces/common-utils/dist/types';

import {
  bulkInsertMetricsGauge,
  DEFAULT_DATABASE,
  DEFAULT_METRICS_TABLE,
} from '@/fixtures';
import { callTool, getFirstText } from '@/mcp/__tests__/mcpTestUtils';
import { seedSource } from '@/metadata/testing/seed';

import { setupDashboardTests } from './setup';

describe('cbt_query_tile metric formula columns (D7)', () => {
  const ctx = setupDashboardTests();

  async function queryFormulaTile(showOperandSeries: boolean) {
    const metricSource = await seedSource({
      kind: SourceKind.Metric,
      team: ctx.team._id,
      from: { databaseName: DEFAULT_DATABASE, tableName: '' },
      metricTables: {
        [MetricsDataType.Gauge.toLowerCase()]: DEFAULT_METRICS_TABLE.GAUGE,
      },
      timestampValueExpression: 'TimeUnix',
      connection: ctx.connection._id,
      name: 'Gauge Metrics',
    });
    const now = new Date();
    await bulkInsertMetricsGauge([
      {
        MetricName: 'formula.errors',
        ResourceAttributes: {},
        ServiceName: 'api',
        TimeUnix: now,
        Value: 10,
      },
      {
        MetricName: 'formula.requests',
        ResourceAttributes: {},
        ServiceName: 'api',
        TimeUnix: now,
        Value: 200,
      },
    ]);

    const createResult = await callTool(ctx.client!, 'cbt_save_dashboard', {
      name: 'Formula Dashboard',
      tiles: [
        {
          name: 'Error rate',
          config: {
            displayType: 'line',
            sourceId: metricSource._id.toString(),
            select: [
              {
                aggFn: 'max',
                metricType: 'gauge',
                metricName: 'formula.errors',
                alias: 'Errors',
              },
              {
                aggFn: 'max',
                metricType: 'gauge',
                metricName: 'formula.requests',
                alias: 'Requests',
              },
            ],
            formulas: [{ expression: 'A / B * 100', alias: 'Error rate %' }],
            showOperandSeries,
          },
        },
      ],
    });
    if (createResult.isError) throw new Error(getFirstText(createResult));
    const dashboard = JSON.parse(getFirstText(createResult));

    const result = await callTool(ctx.client!, 'cbt_query_tile', {
      dashboardId: dashboard.id,
      tileId: dashboard.tiles[0].id,
      startTime: new Date(now.getTime() - 60_000).toISOString(),
      endTime: new Date(now.getTime() + 60_000).toISOString(),
    });
    expect(result.isError).toBeFalsy();
    const parsed: { result: { data: Array<Record<string, unknown>> } } =
      JSON.parse(getFirstText(result));
    return parsed.result.data;
  }

  it('omits hidden operand columns', async () => {
    const rows = await queryFormulaTile(false);
    expect(rows.length).toBeGreaterThan(0);
    expect(Number(rows[0]['Error rate %'])).toBe(5);
    expect(rows[0]).not.toHaveProperty('Errors');
    expect(rows[0]).not.toHaveProperty('Requests');
  });

  it('returns operand and formula columns when operands are shown', async () => {
    const rows = await queryFormulaTile(true);
    expect(rows.length).toBeGreaterThan(0);
    expect(Number(rows[0]['Error rate %'])).toBe(5);
    expect(Number(rows[0].Errors)).toBe(10);
    expect(Number(rows[0].Requests)).toBe(200);
  });
});
