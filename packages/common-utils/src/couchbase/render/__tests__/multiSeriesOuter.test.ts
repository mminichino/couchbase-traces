import { DisplayType } from '@/types';

import {
  count,
  outer,
  render,
  SERVICE,
  sqlOf,
  table,
} from './multiSeriesFixtures';

// D17: upstream renderChartConfig.test.ts "multi-series metric charts
// (composed query) > outer HAVING / ORDER BY / LIMIT", same inputs. HAVING,
// ORDER BY and LIMIT apply once, to the joined result. SQL++ rejects select
// aliases, window functions and a missing GROUP BY in HAVING, so the filter
// is a WHERE on a wrapper around the joined statement in every shape; upstream
// needs that wrapper only for share_of_total.

describe('D17 multi-series outer HAVING / ORDER BY / LIMIT', () => {
  it('renders having, orderBy and limit once, on the outer joined statement only', async () => {
    const { sql, params } = await render({
      ...table,
      groupBy: SERVICE,
      having: '"avg(metric.alpha)" > 10',
      havingLanguage: 'sql',
      orderBy: [{ valueExpression: '"avg(metric.beta)"', ordering: 'DESC' }],
      limit: { limit: 5, offset: 10 },
    });

    const where = 'WHERE (`avg(metric.alpha)` > 10)';
    const orderBy = 'ORDER BY `avg(metric.beta)` DESC';
    expect(count(sql, where)).toBe(1);
    expect(count(sql, orderBy)).toBe(1);
    expect(count(sql, 'HAVING')).toBe(0);
    // Filter, then order, then limit, after the join's GROUP BY.
    const groupByIdx = sql.lastIndexOf('GROUP BY ServiceName');
    expect(groupByIdx).toBeGreaterThan(-1);
    expect(sql.indexOf(where)).toBeGreaterThan(groupByIdx);
    expect(sql.indexOf(orderBy)).toBeGreaterThan(sql.indexOf(where));
    const limit = /LIMIT \$(p\d+) OFFSET \$(p\d+)$/.exec(sql);
    expect(limit).not.toBeNull();
    expect(params[limit![1]]).toBe(5);
    expect(params[limit![2]]).toBe(10);
    expect(sql).toMatch(/^SELECT `d`\.\* FROM \(SELECT /);
    expect(sql).toContain(') AS `d` WHERE');
  });

  it('keeps every parameter reference bound after the outer clauses', async () => {
    const { sql, params } = await render({
      ...table,
      groupBy: SERVICE,
      having: '"avg(metric.alpha)" > 10',
      limit: { limit: 5, offset: 10 },
    });
    const refs = [...sql.matchAll(/\$(p\d+)\b/g)].map(m => m[1]);
    expect(refs.length).toBeGreaterThan(2);
    for (const ref of refs) expect(params).toHaveProperty(ref);
    expect(new Set(refs).size).toBe(Object.keys(params).length);
  });

  it('keeps time charts bucket-ordered first, with the user sort as tiebreaker', async () => {
    const sql = await sqlOf({
      groupBy: SERVICE,
      orderBy: [{ valueExpression: 'ServiceName', ordering: 'ASC' }],
    });
    expect(outer(sql)).toContain(
      'ORDER BY `__hdx_time_bucket`, `ServiceName` ASC',
    );
  });

  it('filters a share_of_total ratio through a wrapper, not HAVING (window function)', async () => {
    const { sql, params } = await render({
      ...table,
      groupBy: SERVICE,
      seriesReturnType: 'ratio',
      ratioMode: 'share_of_total',
      having: '"avg(metric.alpha)/avg(metric.beta)" >= 0.2',
      havingLanguage: 'sql',
      orderBy: [
        {
          valueExpression: '"avg(metric.alpha)/avg(metric.beta)"',
          ordering: 'DESC',
        },
      ],
      limit: { limit: 2 },
    });
    expect(sql).not.toContain('HAVING');
    expect(sql).toContain(' OVER (');
    const whereIdx = sql.indexOf(
      'WHERE (`avg(metric.alpha)/avg(metric.beta)` >= 0.2)',
    );
    expect(whereIdx).toBeGreaterThan(sql.lastIndexOf('GROUP BY'));
    const orderByIdx = sql.indexOf(
      'ORDER BY `avg(metric.alpha)/avg(metric.beta)` DESC',
    );
    expect(orderByIdx).toBeGreaterThan(whereIdx);
    const limit = /LIMIT \$(p\d+)$/.exec(sql);
    expect(params[limit![1]]).toBe(2);
  });

  it('renders a string-form orderBy on the outer statement', async () => {
    const sql = await sqlOf({
      ...table,
      groupBy: SERVICE,
      orderBy: '"avg(metric.alpha)" DESC',
    });
    expect(count(sql, 'ORDER BY `avg(metric.alpha)` DESC')).toBe(1);
    expect(sql.indexOf('ORDER BY `avg(metric.alpha)` DESC')).toBeGreaterThan(
      sql.lastIndexOf('GROUP BY ServiceName'),
    );
  });

  it('renders HAVING on the number shape without a GROUP BY', async () => {
    const sql = await sqlOf({
      displayType: DisplayType.Number,
      granularity: undefined,
      having: '"avg(metric.alpha)" > 10',
      havingLanguage: 'sql',
    });
    expect(outer(sql)).not.toContain('GROUP BY');
    expect(count(sql, 'WHERE (`avg(metric.alpha)` > 10)')).toBe(1);
  });

  it('lets HAVING reference a formula output column', async () => {
    const sql = await sqlOf({
      ...table,
      groupBy: SERVICE,
      formulas: [{ expression: 'A / B', alias: 'err rate' }],
      having: '"err rate" > 0.5',
      havingLanguage: 'sql',
    });
    expect(sql).not.toContain('HAVING');
    expect(sql.indexOf('WHERE (`err rate` > 0.5)')).toBeGreaterThan(
      sql.lastIndexOf('GROUP BY ServiceName'),
    );
  });

  it('applies a lone limit with its offset to the joined result', async () => {
    const { sql, params } = await render({
      ...table,
      groupBy: SERVICE,
      limit: { limit: 7, offset: 3 },
    });
    const limit = /GROUP BY ServiceName LIMIT \$(p\d+) OFFSET \$(p\d+)$/.exec(
      sql,
    );
    expect(limit).not.toBeNull();
    expect(params[limit![1]]).toBe(7);
    expect(params[limit![2]]).toBe(3);
  });

  // The wrapper is aliased `d`, the alias Lucene conditions compile to, so a
  // Lucene HAVING reads the joined result's columns.
  it('filters the joined result with a Lucene having', async () => {
    const { sql, params } = await render({
      ...table,
      groupBy: SERVICE,
      having: 'ServiceName:api',
      havingLanguage: 'lucene',
    });
    expect(sql).toMatch(
      /\) AS `d` WHERE \(LOWER\(d\.`ServiceName`\) LIKE \$p\d+/,
    );
    expect(Object.values(params)).toContain('%api%');
  });

  it('leaves a chart without having, orderBy or limit unwrapped', async () => {
    const sql = await sqlOf({ groupBy: SERVICE });
    expect(sql).toMatch(/^SELECT MAX\(CASE/);
    expect(sql).toMatch(/ AS multi GROUP BY .* ORDER BY `__hdx_time_bucket`$/);
  });
});
