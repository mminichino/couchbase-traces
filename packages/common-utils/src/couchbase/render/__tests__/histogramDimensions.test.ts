import type { ChartConfigWithOptDateRangeEx } from '@/core/chartConfig';
import { renderChartConfigCouchbase } from '@/couchbase/render';
import { MetricsDataType } from '@/types';

import { metadata, metricSeriesConfig } from './defectFixtures';

const render = (config: unknown) =>
  renderChartConfigCouchbase(
    config as ChartConfigWithOptDateRangeEx,
    metadata,
    undefined,
  );

/** The body of one `name AS (...)` CTE. */
function cte(sql: string, name: string): string {
  const start = sql.indexOf(`\`${name}\` AS (`);
  expect(start).toBeGreaterThanOrEqual(0);
  const rest = sql.slice(start);
  const next = rest.indexOf('), `', 1);
  return next < 0 ? rest : rest.slice(0, next);
}

const histogramQuantile = (extra: Record<string, unknown> = {}) =>
  metricSeriesConfig(
    {
      aggFn: 'quantile',
      level: 0.95,
      metricName: 'test.metric.histogram',
      metricType: MetricsDataType.Histogram,
    },
    { granularity: '1 minute', ...extra },
  );

// D1: "Ambiguous reference to field '__hdx_time_bucket'" (external charts
// histogram series) and "... field 'group'" (cbt_query_tile grouped histogram
// bar). The `flat` CTE reads `source AS s UNNEST ... AS i`; with two FROM
// terms SQL++ cannot resolve a bare column, so each one must be qualified.
describe('D1 histogram quantile dimension columns under UNNEST', () => {
  it('qualifies the time bucket in the flat CTE', async () => {
    const q = await render(histogramQuantile());
    const flat = cte(q.sql, 'flat');
    expect(flat).toContain('UNNEST');
    expect(flat).toContain('s.`__hdx_time_bucket` AS `__hdx_time_bucket`');
    expect(flat).not.toMatch(/SELECT `__hdx_time_bucket`/);
  });

  it('qualifies the group column in the flat CTE', async () => {
    const q = await render(
      histogramQuantile({
        granularity: undefined,
        groupBy: [{ valueExpression: "ResourceAttributes['service.name']" }],
      }),
    );
    const flat = cte(q.sql, 'flat');
    expect(flat).toContain('s.`group` AS `group`');
    expect(flat).not.toMatch(/SELECT `group`/);
  });

  it('keeps the bucket and group names on the outer result', async () => {
    const q = await render(
      histogramQuantile({
        groupBy: [{ valueExpression: "ResourceAttributes['service.name']" }],
      }),
    );
    expect(q.sql).toMatch(
      /SELECT `__hdx_time_bucket`, `group`, `series_0` FROM `metrics`/,
    );
  });
});
