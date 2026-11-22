import { setChartSelectsAlias } from '@/core/chartConfig';
import { renderChartConfigCouchbase } from '@/couchbase/render';
import { DisplayType, MetricsDataType } from '@/types';

import { dateRange, logTableConfig, metadata } from './defectFixtures';

const metricTables = {
  gauge: 'otel_metrics_gauge',
  sum: 'otel_metrics_sum',
  histogram: 'otel_metrics_histogram',
};

/** The single-series config `convertV1ChartConfigToV2` builds on /kubernetes. */
function k8sSeries(
  field: string,
  aggFn: string | undefined,
  extra: Record<string, unknown> = {},
  selectExtra: Record<string, unknown> = {},
) {
  const [metricName, type] = field.split(' - ');
  return setChartSelectsAlias({
    select: [
      {
        aggFn,
        metricType:
          type === 'Sum' ? MetricsDataType.Sum : MetricsDataType.Gauge,
        valueExpression: field,
        metricName,
        aggConditionLanguage: 'lucene',
        aggCondition: '',
        ...selectExtra,
      },
    ],
    from: { databaseName: 'otel', tableName: '' },
    groupBy: "ResourceAttributes['k8s.pod.name']",
    dateRange,
    connection: 'conn',
    metricTables,
    timestampValueExpression: 'TimeUnix',
    where: '',
    granularity: '1 minute',
    displayType: DisplayType.Line,
    ...extra,
  } as never);
}

const render = async (config: unknown) =>
  (await renderChartConfigCouchbase(config as never, metadata, undefined)).sql;

describe('D10 /kubernetes metric series', () => {
  it('quotes a dotted metric alias as one identifier', async () => {
    const sql = await render(
      k8sSeries('k8s.pod.cpu.utilization - Gauge', 'avg'),
    );
    expect(sql).toContain('AS `avg(k8s.pod.cpu.utilization)`');
    expect(sql).not.toContain('`avg(k8s`.`pod`');
  });

  it('renders the semantic-convention metric name filter as an SQL++ array', async () => {
    const sql = await render(
      k8sSeries(
        'k8s.pod.cpu.utilization - Gauge',
        'avg',
        {},
        {
          metricNameSql:
            "MetricName IN ('k8s.pod.cpu.utilization', 'k8s.pod.cpu.usage')",
        },
      ),
    );
    expect(sql).toContain(
      "MetricName IN ['k8s.pod.cpu.utilization', 'k8s.pod.cpu.usage']",
    );
  });

  it.each([
    ['k8s.pod.cpu.utilization - Gauge', 'avg'],
    ['k8s.pod.uptime - Sum', undefined],
  ])(
    'keeps resource attributes on the bucketed rows for %s',
    async (field, aggFn) => {
      const sql = await render(k8sSeries(field, aggFn));
      const bucketed = sql.slice(sql.indexOf('`Bucketed` AS ('));
      expect(bucketed).toContain(
        'MIN(ResourceAttributes) AS ResourceAttributes',
      );
      expect(bucketed).toContain('MIN(Attributes) AS Attributes');
    },
  );

  it('aggregates the last cumulative Sum when the series has no aggFn', async () => {
    const sql = await render(k8sSeries('k8s.pod.uptime - Sum', undefined));
    expect(sql).toContain(
      'MAX([d.__hdx_time_bucket2, Sum])[1] AS `undefined(k8s.pod.uptime)`',
    );
  });

  // Each branch renders from $p0; merged as-is, one branch's date bounds would
  // silently bind to another's names.
  it('gives each multi-series branch its own parameter names', async () => {
    const base = k8sSeries('k8s.pod.cpu.utilization - Gauge', 'avg') as {
      select: Record<string, unknown>[];
    };
    const { sql, params } = await renderChartConfigCouchbase(
      {
        ...base,
        select: [
          base.select[0],
          { ...base.select[0], metricName: 'k8s.node.cpu.utilization' },
        ],
        dateRange: [dateRange[0], new Date(dateRange[1].getTime() + 1)],
      } as never,
      metadata,
      undefined,
    );
    const refs = new Set([...sql.matchAll(/\$(p\d+)\b/g)].map(m => m[1]));
    expect(refs).toEqual(new Set(Object.keys(params)));
    expect(refs.size).toBe(4);
  });
});

describe('D10 /services select alias reuse', () => {
  it('inlines an earlier select alias referenced by a later item', async () => {
    const sql = await render(
      logTableConfig({
        select: [
          { aggFn: 'count', alias: 'total_requests', valueExpression: '' },
          {
            aggFn: 'count',
            alias: 'error_requests',
            valueExpression: '',
            aggCondition: "SeverityText = 'error'",
            aggConditionLanguage: 'sql',
          },
          {
            alias: 'error_rate',
            valueExpression: 'error_requests / total_requests',
          },
        ],
      }),
    );
    expect(sql).toContain(
      "(COUNT(CASE WHEN (SeverityText = 'error') THEN 1 END)) / (COUNT(*)) AS `error_rate`",
    );
  });

  it('keeps the parameters of an inlined quantile', async () => {
    const q = await renderChartConfigCouchbase(
      logTableConfig({
        select: [
          {
            aggFn: 'quantile',
            level: 0.95,
            alias: 'p95_ns',
            valueExpression: 'Duration',
          },
          { alias: 'P95', valueExpression: 'p95_ns / 1e6' },
        ],
      }) as never,
      metadata,
      undefined,
    );
    expect(q.sql).not.toMatch(/[^`(]p95_ns \/ 1e6/);
    expect(Object.values(q.params).filter(v => v === 0.95)).toHaveLength(2);
  });

  it('does not touch a field that shares a later alias name', async () => {
    const sql = await render(
      logTableConfig({
        select: [
          { alias: 'Body', valueExpression: 'Body' },
          { aggFn: 'count', alias: 'n', valueExpression: '' },
        ],
      }),
    );
    expect(sql).toContain('Body AS `Body`');
  });
});

describe('D10 /llm select aliases', () => {
  it('inlines an alias defined later in the select list', async () => {
    const sql = await render(
      logTableConfig({
        select: [
          {
            alias: 'error_rate',
            valueExpression: 'error_count / greatest(total_count, 1)',
          },
          {
            aggFn: 'count',
            alias: 'error_count',
            valueExpression: '',
            aggCondition: "SeverityText = 'error'",
            aggConditionLanguage: 'sql',
          },
          { aggFn: 'count', alias: 'total_count', valueExpression: '' },
        ],
      }),
    );
    expect(sql).toContain(
      "(COUNT(CASE WHEN (SeverityText = 'error') THEN 1 END)) / greatest((COUNT(*)), 1) AS `error_rate`",
    );
  });

  it('reads a double-quoted select alias as the alias, as ClickHouse does', async () => {
    const sql = await render(
      logTableConfig({
        select: [
          { aggFn: 'count', alias: 'Calls', valueExpression: '' },
          { aggFn: 'sum', alias: 'Est. Cost', valueExpression: 'Duration' },
          {
            alias: 'Avg Cost / Call',
            valueExpression: '"Est. Cost" / greatest("Calls", 1)',
          },
        ],
      }),
    );
    expect(sql).toContain(
      '(SUM(TONUMBER(Duration))) / greatest((COUNT(*)), 1) AS `Avg Cost / Call`',
    );
  });

  it('keeps a double-quoted string that names no alias', async () => {
    const sql = await render(
      logTableConfig({
        select: [
          { aggFn: 'count', alias: 'Calls', valueExpression: '' },
          { alias: 'label', valueExpression: 'concat("Calls: ", "x")' },
        ],
      }),
    );
    expect(sql).toContain('concat("Calls: ", "x") AS `label`');
  });

  it('resolves aliases that reference each other in a cycle without looping', async () => {
    const sql = await render(
      logTableConfig({
        select: [
          { alias: 'a', valueExpression: 'b + 1' },
          { alias: 'b', valueExpression: 'a + 1' },
        ],
      }),
    );
    expect(sql).toContain('AS `a`');
    expect(sql).toContain('AS `b`');
  });

  it('groups by the expression a select alias names', async () => {
    const sql = await render(
      logTableConfig({
        select: [
          {
            alias: 'Model',
            valueExpression: "coalesce(nullif(LogAttributes['model'], ''), '')",
          },
          { aggFn: 'count', alias: 'Calls', valueExpression: '' },
        ],
        groupBy: 'Model',
        selectGroupBy: false,
        orderBy: '"Calls" DESC',
      }),
    );
    expect(sql).toContain(
      "coalesce(nullif(LogAttributes.`model`, ''), '') AS `Model`",
    );
    expect(sql).toContain(
      "GROUP BY coalesce(nullif(LogAttributes.`model`, ''), '')",
    );
    expect(sql).not.toMatch(/GROUP BY Model\b/);
  });

  it('groups by the aliased expressions of a groupBy array (sessions list)', async () => {
    const sql = await render(
      logTableConfig({
        select: [
          { alias: 'serviceName', valueExpression: 'ServiceName' },
          {
            alias: 'sessionId',
            valueExpression: "LogAttributes['session.id']",
          },
          { aggFn: 'count', alias: 'sessionCount', valueExpression: '' },
        ],
        groupBy: [
          { valueExpression: 'serviceName' },
          { valueExpression: 'sessionId' },
        ],
        selectGroupBy: false,
      }),
    );
    expect(sql).toContain('GROUP BY ServiceName, LogAttributes.`session.id`');
  });

  it('still projects a group-by column that shares no select alias', async () => {
    const sql = await render(
      logTableConfig({
        select: [{ aggFn: 'count', alias: 'n', valueExpression: '' }],
        groupBy: 'ServiceName',
      }),
    );
    expect(sql).toContain('GROUP BY ServiceName');
    expect(sql).toMatch(/COUNT\(\*\) AS `n`, ServiceName/);
  });
});

describe('D10 /sessions session-id subquery filters', () => {
  it('selects RAW ids in a SQL where IN subquery', async () => {
    const sql = await render(
      logTableConfig({
        select: [{ aggFn: 'count', alias: 'n', valueExpression: '' }],
        where:
          "ResourceAttributes['rum.sessionId'] IN (SELECT sessions.sessionId FROM sessions)",
        whereLanguage: 'sql',
      }),
    );
    expect(sql).toContain(
      'ResourceAttributes.`rum.sessionId` IN (SELECT RAW sessions.sessionId FROM sessions)',
    );
  });
});
