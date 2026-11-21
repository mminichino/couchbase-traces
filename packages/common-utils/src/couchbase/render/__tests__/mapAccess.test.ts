import type { ChartConfigWithOptDateRangeEx } from '@/core/chartConfig';
import { renderChartConfigCouchbase } from '@/couchbase/render';
import { DisplayType } from '@/types';

import { dateRange, metadata } from './defectFixtures';

// D9: the builder passed ClickHouse map subscripts (`SpanAttributes['k']`)
// through unchanged. SQL++ reads `obj['k']` as an array index (NULL on an
// object), so grouped tiles came back as one empty group and filters matched
// nothing. Inputs are the forms upstream tests and the app generate.
const render = async (overrides: Record<string, unknown>) =>
  renderChartConfigCouchbase(
    {
      displayType: DisplayType.Table,
      connection: 'conn-1',
      from: { databaseName: 'otel', tableName: 'otel_traces' },
      timestampValueExpression: 'Timestamp',
      select: [{ aggFn: 'count', valueExpression: '' }],
      where: '',
      whereLanguage: 'sql',
      dateRange,
      ...overrides,
    } as unknown as ChartConfigWithOptDateRangeEx,
    metadata,
    undefined,
  );

const sqlOf = async (overrides: Record<string, unknown>) =>
  (await render(overrides)).sql;

/** No subscript outside backticked names (aliases keep the source text). */
const noSubscript = (sql: string) =>
  expect(sql.replace(/`[^`]*`/g, '``')).not.toMatch(/Attributes\[\s*['"]/);

describe('D9 builder map access', () => {
  it('groups by a map key and names the column by the original expression', async () => {
    const sql = await sqlOf({
      groupBy: [{ valueExpression: "SpanAttributes['http.route']" }],
    });
    expect(sql).toContain(
      'IFMISSINGORNULL(SpanAttributes.`http.route`, "") AS `SpanAttributes[\'http.route\']`',
    );
    expect(sql).toMatch(
      /GROUP BY IFMISSINGORNULL\(SpanAttributes\.`http\.route`, ""\)/,
    );
  });

  it('keeps an explicit group alias', async () => {
    const sql = await sqlOf({
      groupBy: [
        { valueExpression: "SpanAttributes['http.route']", alias: 'route' },
      ],
    });
    expect(sql).toContain(
      'IFMISSINGORNULL(SpanAttributes.`http.route`, "") AS `route`',
    );
  });

  it('handles string group-by lists', async () => {
    const sql = await sqlOf({
      groupBy: "ServiceName, ResourceAttributes['service.name']",
    });
    expect(sql).toContain(
      'IFMISSINGORNULL(ResourceAttributes.`service.name`, "") AS `ResourceAttributes[\'service.name\']`',
    );
    noSubscript(sql);
  });

  it('rewrites select value expressions and keeps upstream names', async () => {
    const sql = await sqlOf({
      select: [
        { aggFn: 'sum', valueExpression: "SpanAttributes['bytes']" },
        {
          aggFn: 'count',
          valueExpression: '',
          aggCondition: "SpanAttributes['env'] = 'prod'",
          aggConditionLanguage: 'sql',
        },
        {
          aggFn: undefined,
          valueExpression: "Attributes['env']",
          alias: 'env',
        },
      ],
      groupBy: 'ServiceName',
    });
    expect(sql).toContain(
      "SUM(TONUMBER(SpanAttributes.`bytes`)) AS `sum(SpanAttributes['bytes'])`",
    );
    expect(sql).toContain(
      "COUNT(CASE WHEN (SpanAttributes.`env` = 'prod') THEN 1 END)",
    );
    expect(sql).toContain('Attributes.`env` AS `env`');
    noSubscript(sql);
  });

  it('aliases a string select list item by the original expression', async () => {
    const sql = await sqlOf({
      select:
        "Timestamp, SpanAttributes['http.route'], LogAttributes['k'] AS k",
      groupBy: undefined,
    });
    expect(sql).toContain(
      "SpanAttributes.`http.route` AS `SpanAttributes['http.route']`",
    );
    expect(sql).toContain('LogAttributes.`k` AS k');
    noSubscript(sql);
  });

  it('rewrites the SQL where and keeps values as named parameters or literals', async () => {
    const q = await render({
      where: "SpanAttributes['service.name'] IN ('O\\'Reilly API')",
    });
    expect(q.sql).toContain(
      "(SpanAttributes.`service.name` IN ['O\\'Reilly API'])",
    );
  });

  it('rewrites sql and sql_ast filters', async () => {
    const sql = await sqlOf({
      filters: [
        {
          type: 'sql',
          condition: "ResourceAttributes['k8s.pod.name'] IN ('a')",
        },
        {
          type: 'sql_ast',
          operator: '=',
          left: "LogAttributes['path']",
          right: "'/api'",
        },
      ],
    });
    expect(sql).toContain("(ResourceAttributes.`k8s.pod.name` IN ['a'])");
    expect(sql).toContain("(LogAttributes.`path` = '/api')");
    noSubscript(sql);
  });

  it('rewrites order by and having', async () => {
    const sql = await sqlOf({
      groupBy: "ResourceAttributes['service.name']",
      orderBy: "ResourceAttributes['service.name'] DESC",
      having: "COUNT(*) > 1 AND MAX(SpanAttributes['dur']) > 5",
      havingLanguage: 'sql',
    });
    expect(sql).toMatch(
      /ORDER BY IFMISSINGORNULL\(ResourceAttributes\.`service\.name`, ""\) DESC/,
    );
    expect(sql).toContain('MAX(SpanAttributes.`dur`) > 5');
    noSubscript(sql);
  });

  it('rejects a key containing a backtick', async () => {
    await expect(
      sqlOf({ groupBy: [{ valueExpression: "SpanAttributes['a`b']" }] }),
    ).rejects.toThrow(/backtick/);
  });
});
