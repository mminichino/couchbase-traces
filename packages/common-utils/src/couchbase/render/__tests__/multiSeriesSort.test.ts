import { MetricsDataType } from '@/types';

import {
  histSelect,
  MAP_KEY,
  outer,
  SERVICE,
  sqlOf,
  table,
} from './multiSeriesFixtures';

// D17: upstream renderChartConfig.test.ts "outer HAVING / ORDER BY / LIMIT >
// expression group-by ORDER BY (companion sort columns)" (HDX-5202), same
// inputs. An ORDER BY repeating a group-by expression (a table's default
// orderBy is the groupBy text) cannot be evaluated over the joined rows.
// Upstream adds `__hdx_sort_<n>` companion columns; the SQL++ branches
// already name each group column after its source text or alias, so the sort
// reads that column, or the packed `group` array (0-based) for histograms.

const MAP_COLUMN = "`ResourceAttributes['service.name']`";

const twoHistograms = [
  histSelect('metric.latency', 0.5),
  histSelect('metric.latency', 0.99),
];

describe('D17 multi-series expression group-by ORDER BY', () => {
  it('sorts a table default orderBy (= groupBy text) through the group columns', async () => {
    const sql = await sqlOf({
      ...table,
      groupBy: `ServiceName, ${MAP_KEY}`,
      orderBy: `ServiceName, ${MAP_KEY}`,
      limit: { limit: 200 },
    });
    const orderBy = `ORDER BY \`ServiceName\`, ${MAP_COLUMN} LIMIT $`;
    expect(outer(sql)).toContain(orderBy);
    expect(outer(sql).indexOf(orderBy)).toBe(
      outer(sql).lastIndexOf('ORDER BY'),
    );
    // The raw map access never reaches the outer statement.
    expect(outer(sql)).not.toContain('ResourceAttributes.`service.name`');
  });

  it('rewrites a structured item matching an expression group-by, keeping its direction', async () => {
    const sql = await sqlOf({
      ...table,
      groupBy: [{ aggCondition: '', valueExpression: MAP_KEY }],
      orderBy: [{ valueExpression: MAP_KEY, ordering: 'DESC' }],
    });
    expect(outer(sql)).toContain(`ORDER BY ${MAP_COLUMN} DESC`);
  });

  it('sorts through the user alias when the matched group-by entry has one', async () => {
    const sql = await sqlOf({
      ...table,
      groupBy: [
        { aggCondition: '', valueExpression: MAP_KEY, alias: 'service' },
      ],
      orderBy: [{ valueExpression: MAP_KEY, ordering: 'DESC' }],
    });
    expect(outer(sql)).toContain('ORDER BY `service` DESC');
  });

  // A mixed gauge and histogram chart sorts on the scalar group column
  // (multiSeriesMixedGroups.test.ts, D20).

  it('sorts an all-histogram chart positionally on the packed group array', async () => {
    const sql = await sqlOf({
      ...table,
      select: twoHistograms,
      groupBy: `ServiceName, ${MAP_KEY}`,
      orderBy: `ServiceName, ${MAP_KEY}`,
      limit: { limit: 200 },
    });
    expect(outer(sql)).toMatch(
      /ORDER BY `group`\[0\], `group`\[1\] LIMIT \$p\d+$/,
    );
    expect(outer(sql)).not.toContain('ResourceAttributes');
  });

  it('sorts an all-histogram chart by a plain group column through the packed array', async () => {
    const sql = await sqlOf({
      ...table,
      select: [
        histSelect('metric.latency', 0.5),
        {
          aggFn: 'count',
          aggCondition: '',
          aggConditionLanguage: 'sql',
          valueExpression: '',
          metricName: 'metric.latency',
          metricType: MetricsDataType.Histogram,
        },
      ],
      groupBy: SERVICE,
      orderBy: [{ valueExpression: 'ServiceName', ordering: 'DESC' }],
    });
    expect(outer(sql)).toContain('ORDER BY `group`[0] DESC');
  });

  it('sorts an all-histogram chart by a group-by alias through the packed array', async () => {
    const sql = await sqlOf({
      ...table,
      select: twoHistograms,
      groupBy: [
        { aggCondition: '', valueExpression: MAP_KEY, alias: 'service' },
      ],
      orderBy: [{ valueExpression: 'service', ordering: 'ASC' }],
    });
    expect(outer(sql)).toContain('ORDER BY `group`[0] ASC');
  });

  it('splits a structured sort item carrying a multi-dimension expression', async () => {
    const sql = await sqlOf({
      ...table,
      select: twoHistograms,
      groupBy: `ServiceName, ${MAP_KEY}`,
      orderBy: [
        { valueExpression: `ServiceName, ${MAP_KEY}`, ordering: 'DESC' },
      ],
    });
    expect(outer(sql)).toContain('ORDER BY `group`[0], `group`[1] DESC');
  });

  it('rewrites the sort for a share_of_total ratio without HAVING', async () => {
    const sql = await sqlOf({
      ...table,
      seriesReturnType: 'ratio',
      ratioMode: 'share_of_total',
      groupBy: MAP_KEY,
      orderBy: MAP_KEY,
    });
    expect(sql).not.toContain('AS `d`');
    expect(outer(sql)).toContain(`ORDER BY ${MAP_COLUMN}`);
  });

  // Upstream keeps the raw expression here and fails at query time: its
  // wrapper has no GROUP BY for any() and excludes the companions. The
  // SQL++ wrapper keeps the named group column, so the sort resolves.
  it('sorts the share_of_total HAVING wrapper by the group column', async () => {
    const sql = await sqlOf({
      ...table,
      seriesReturnType: 'ratio',
      ratioMode: 'share_of_total',
      groupBy: MAP_KEY,
      orderBy: MAP_KEY,
      having: '"avg(metric.alpha)/avg(metric.beta)" >= 0.2',
      havingLanguage: 'sql',
    });
    expect(sql).toContain(') AS `d` WHERE');
    expect(sql.slice(sql.lastIndexOf('ORDER BY'))).toBe(
      `ORDER BY ${MAP_COLUMN}`,
    );
  });

  it('leaves a plain-column orderBy matching a group-by as that column', async () => {
    const sql = await sqlOf({
      ...table,
      groupBy: SERVICE,
      orderBy: 'ServiceName',
    });
    expect(outer(sql)).toContain('ORDER BY `ServiceName`');
  });
});
