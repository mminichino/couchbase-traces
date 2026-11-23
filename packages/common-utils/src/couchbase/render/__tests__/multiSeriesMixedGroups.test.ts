import { couchbasePostprocessHints } from '@/couchbase/render/postprocess';
import { DisplayType, MetricsDataType } from '@/types';

import {
  gaugeSelect,
  histSelect,
  MAP_KEY,
  outer,
  SERVICE,
  sqlOf,
  table,
} from './multiSeriesFixtures';

// D20: upstream renderChartConfig.test.ts "multi-series metric charts
// (composed query) > pads group columns across gauge and histogram branch
// classes" and "> pads companion sort slots with NULL in histogram
// branches", same inputs. A gauge or sum branch keeps its group columns and
// pads the histogram's packed `group` with []; a histogram branch pads each
// scalar group column with NULL. The two classes never share a grouping key.
// SQL++ UNION ALL merges objects by field name, not position, so a pad takes
// the scalar column's own name instead of upstream's `__hdx_group_pad_<n>`.

const mixed = [gaugeSelect('metric.alpha'), histSelect('metric.latency', 0.5)];
const MAP_COLUMN = "`ResourceAttributes['service.name']`";

/** The wrapper of branch `idx` (between its FROM subquery and `AS b<idx>`). */
const wrapper = (sql: string, idx: number) => {
  const start = sql.indexOf(`(SELECT TONUMBER(\`__hdx_value\`)`);
  const branches = sql.slice(start).split(' UNION ALL ');
  const branch = branches.at(idx) ?? '';
  return branch.slice(0, branch.indexOf(' FROM ('));
};

describe('D20 mixed gauge and histogram group columns', () => {
  it('pads group columns across gauge and histogram branch classes', async () => {
    const sql = await sqlOf({ select: mixed, groupBy: SERVICE });
    expect(wrapper(sql, 0)).toBe(
      '(SELECT TONUMBER(`__hdx_value`) AS `__hdx_value`, `__hdx_time_bucket`, ServiceName, [] AS `group`, 0 AS `__hdx_series_idx`',
    );
    expect(wrapper(sql, 1)).toBe(
      '(SELECT TONUMBER(`__hdx_value`) AS `__hdx_value`, `__hdx_time_bucket`, NULL AS `ServiceName`, `group`, 1 AS `__hdx_series_idx`',
    );
    expect(outer(sql)).toBe(
      ') AS multi GROUP BY `__hdx_time_bucket`, ServiceName, `group` ORDER BY `__hdx_time_bucket`',
    );
    expect(sql).toMatch(
      /^SELECT .* AS `quantile\(metric\.latency\)`, `__hdx_time_bucket`, ServiceName, `group` FROM/,
    );
  });

  it('pads a map-key group column by its result name', async () => {
    const sql = await sqlOf({
      select: mixed,
      groupBy: [{ aggCondition: '', valueExpression: MAP_KEY }],
    });
    expect(wrapper(sql, 0)).toContain(`${MAP_COLUMN}, [] AS \`group\``);
    expect(wrapper(sql, 1)).toContain(`NULL AS ${MAP_COLUMN}, \`group\``);
    expect(outer(sql)).toContain(
      `GROUP BY \`__hdx_time_bucket\`, ${MAP_COLUMN}, \`group\``,
    );
  });

  it('pads every scalar group column, aliases included', async () => {
    const sql = await sqlOf({
      ...table,
      select: mixed,
      groupBy: [
        ...SERVICE,
        { aggCondition: '', valueExpression: MAP_KEY, alias: 'service' },
      ],
    });
    expect(wrapper(sql, 0)).toContain('ServiceName, `service`, [] AS `group`');
    expect(wrapper(sql, 1)).toContain(
      'NULL AS `ServiceName`, NULL AS `service`, `group`',
    );
    expect(outer(sql)).toContain('GROUP BY ServiceName, `service`, `group`');
  });

  it('keeps a sum branch grouped beside a histogram branch', async () => {
    const sql = await sqlOf({
      select: [
        {
          ...gaugeSelect('metric.requests'),
          aggFn: 'sum',
          metricType: MetricsDataType.Sum,
        },
        histSelect('metric.latency', 0.5),
      ],
      groupBy: SERVICE,
    });
    expect(wrapper(sql, 0)).toContain('ServiceName, [] AS `group`');
    expect(wrapper(sql, 1)).toContain('NULL AS `ServiceName`, `group`');
  });

  it('leaves an all-histogram chart packed into the group column', async () => {
    const sql = await sqlOf({
      select: [
        histSelect('metric.latency', 0.5),
        histSelect('metric.latency', 0.99),
      ],
      groupBy: SERVICE,
    });
    expect(sql).not.toContain('NULL AS');
    expect(sql).not.toContain('[] AS');
    expect(outer(sql)).toBe(
      ') AS multi GROUP BY `__hdx_time_bucket`, `group` ORDER BY `__hdx_time_bucket`',
    );
  });

  // Upstream sorts on a companion the histogram branch pads with NULL, and
  // ClickHouse puts NULL last; SQL++ puts NULL first in ascending order.
  it('sorts on the scalar group column with histogram pads last', async () => {
    const sql = await sqlOf({
      select: mixed,
      groupBy: [{ aggCondition: '', valueExpression: MAP_KEY }],
      orderBy: [{ valueExpression: MAP_KEY, ordering: 'ASC' }],
    });
    expect(outer(sql)).toContain(
      `ORDER BY \`__hdx_time_bucket\`, ${MAP_COLUMN} ASC NULLS LAST`,
    );
    expect(outer(sql)).not.toContain('`group`[');
  });

  it('filters HAVING on a scalar group column of a mixed chart', async () => {
    const sql = await sqlOf({
      select: mixed,
      groupBy: SERVICE,
      having: '"ServiceName" = \'svc-a\'',
      havingLanguage: 'sql',
    });
    expect(sql).toContain(") AS `d` WHERE (`ServiceName` = 'svc-a')");
  });
});

// Upstream queryChartConfig.int.test.ts "places the group-by columns after
// the value columns" / "packs every group-by of %s into one group column".
describe('D20 grouped histogram result columns', () => {
  const groupBy = [
    ...SERVICE,
    { aggCondition: '', valueExpression: MAP_KEY, alias: 'service' },
  ];
  const hinted = (select: unknown[]) =>
    couchbasePostprocessHints({
      ...table,
      displayType: DisplayType.Table,
      select,
      groupBy,
    } as never).columns ?? [];

  it('names the scalar group columns after the values for a gauge and a histogram', () => {
    expect(hinted(mixed)).toEqual([
      'avg(Value)',
      'quantile(Value)',
      'ServiceName',
      'service',
    ]);
  });

  it.each([
    ['one histogram', [histSelect('metric.latency', 0.5)]],
    [
      'two histograms',
      [histSelect('metric.latency', 0.5), histSelect('metric.latency', 0.99)],
    ],
  ])('packs every group-by of %s into one group column', (_case, select) => {
    expect(hinted(select)).not.toContain('ServiceName');
    expect(hinted(select)).not.toContain('service');
  });
});
