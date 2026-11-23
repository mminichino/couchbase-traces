import { declaredColumns } from '@/couchbase/otelSchema';
import { renderChartConfigCouchbase } from '@/couchbase/render';
import { DisplayType, MetricsDataType } from '@/types';

// D24: upstream renderMetricWhere weaves the chart `where` (language
// defaulting to SQL), `filters`, and select aggConditions into every metric
// source CTE, and the outer query keeps none of them (`filters` is
// destructured off, `where` is cleared). D25: upstream's Sum branch spreads
// `{ alias: 'Value', ..._select }`, so an unaliased Sum select is `Value`.

const TABLES = {
  gauge: 'otel_metrics_gauge',
  sum: 'otel_metrics_sum',
  histogram: 'otel_metrics_histogram',
  'exponential histogram': 'otel_metrics_exponential_histogram',
};

const ALL = [
  MetricsDataType.Gauge,
  MetricsDataType.Sum,
  MetricsDataType.Histogram,
  MetricsDataType.ExponentialHistogram,
];

const isHist = (t: MetricsDataType) =>
  t === MetricsDataType.Histogram || t === MetricsDataType.ExponentialHistogram;

const render = (
  metricType: MetricsDataType,
  extra: Record<string, unknown> = {},
  select: Record<string, unknown> = {},
) =>
  renderChartConfigCouchbase(
    {
      displayType: DisplayType.Line,
      connection: 'c',
      from: { databaseName: 'otel', scopeName: 'default', tableName: '' },
      metricTables: TABLES,
      select: [
        {
          aggFn: isHist(metricType) ? 'count' : 'sum',
          metricName: 'm',
          metricType,
          valueExpression: 'Value',
          aggCondition: '',
          ...select,
        },
      ],
      where: '',
      timestampValueExpression: 'TimeUnix',
      dateRange: [
        new Date('2022-01-05T00:00:00Z'),
        new Date('2022-01-05T00:02:00Z'),
      ],
      granularity: '1 minute',
      ...extra,
    } as never,
    {
      getColumns: async ({ tableName }: { tableName: string }) =>
        declaredColumns(tableName) ?? [],
    } as never,
    undefined,
  );

/** The first CTE (the metric source) and the final SELECT, apart. */
function split(sql: string) {
  const source =
    /^WITH `(?:Source|source|filtered_series)` AS \((.*?)\), `/.exec(sql);
  if (!source) throw new Error(`no source CTE in ${sql}`);
  const outer = sql.slice(sql.lastIndexOf(') SELECT ') + 2);
  return { source: source[1], outer };
}

const firstCte = (sql: string) => {
  const m =
    /^WITH `[^`]+` AS \(SELECT .*? FROM `otel`\.`default`\.`[^`]+` AS d WHERE (.*?)\)(?:, `|\s+SELECT )/.exec(
      sql,
    );
  if (!m) throw new Error(`no source WHERE in ${sql}`);
  return m[1];
};

describe('D24 metric source WHERE', () => {
  it.each(ALL)(
    'applies a SQL chart where (language defaults to sql) in the %s source',
    async metricType => {
      const q = await render(metricType, {
        where: "Attributes['route'] = '/target'",
      });
      expect(firstCte(q.sql)).toContain("(Attributes.`route` = '/target')");
      expect(split(q.sql).outer).not.toContain('/target');
    },
  );

  it.each(ALL)(
    'compiles a Lucene where into the %s source',
    async metricType => {
      const q = await render(metricType, {
        where: 'ServiceName:api',
        whereLanguage: 'lucene',
      });
      const where = firstCte(q.sql);
      expect(where).toMatch(/d\.`?ServiceName`?/);
      // The port's Lucene field match (CouchbaseSearchBuilder) binds a pattern.
      expect(Object.values(q.params)).toContain('%api%');
      expect(split(q.sql).outer).not.toMatch(/ServiceName/);
    },
  );

  it.each(ALL)(
    'moves filters into the %s source and off the outer query',
    async metricType => {
      const q = await render(metricType, {
        filters: [
          { type: 'sql', condition: "ServiceName = 'flt'" },
          { type: 'lucene', condition: 'ServiceName:other' },
        ],
        filtersLogicalOperator: 'OR',
      });
      const where = firstCte(q.sql);
      expect(where).toContain("((ServiceName = 'flt') OR ");
      expect(split(q.sql).outer).not.toContain('flt');
    },
  );

  it.each(ALL)(
    'applies a select aggCondition in the %s source',
    async metricType => {
      const q = await render(
        metricType,
        {},
        { aggCondition: "ServiceName = 'agg'", aggConditionLanguage: 'sql' },
      );
      expect(firstCte(q.sql)).toContain("(ServiceName = 'agg')");
      expect(split(q.sql).outer).not.toContain("'agg'");
    },
  );

  it('scopes each multi-series branch to its own aggCondition plus the chart where', async () => {
    const sel = (metricName: string, aggCondition: string) => ({
      aggFn: 'max',
      metricName,
      metricType: MetricsDataType.Gauge,
      valueExpression: 'Value',
      aggCondition,
      aggConditionLanguage: 'sql',
    });
    const q = await render(MetricsDataType.Gauge, {
      select: [
        sel('a', "ServiceName = 'AAA'"),
        sel('b', "ServiceName = 'BBB'"),
      ],
      where: "ServiceName != 'WWW'",
    });
    const wheres = [
      ...q.sql.matchAll(/ AS d WHERE \(MetricName = '(a|b)'\)(.*?)\)\), `/g),
    ];
    expect(wheres.map(m => [m[1], m[2]])).toEqual([
      [
        'a',
        expect.stringMatching(
          /\(ServiceName != 'WWW'\) AND \(\(ServiceName = 'AAA'\)$/,
        ),
      ],
      [
        'b',
        expect.stringMatching(
          /\(ServiceName != 'WWW'\) AND \(\(ServiceName = 'BBB'\)$/,
        ),
      ],
    ]);
    expect(q.sql.split("'WWW'")).toHaveLength(3);
  });

  it('keeps the metric name and range ahead of the chart where', async () => {
    const q = await render(MetricsDataType.Gauge, {
      where: "ServiceName = 'api'",
    });
    expect(firstCte(q.sql)).toMatch(
      /^\(MetricName = 'm'\) AND d\.TimeUnix >= \$p\d+ AND d\.TimeUnix < \$p\d+ AND \(ServiceName = 'api'\)$/,
    );
  });
});

describe('D25 Sum select alias', () => {
  it.each([
    ['sum', { aggFn: 'sum' }],
    ['increase', { aggFn: 'increase' }],
    ['no aggFn (last value)', { aggFn: undefined }],
  ])('names an unaliased %s select Value', async (_l, select) => {
    const q = await render(MetricsDataType.Sum, {}, select);
    expect(split(q.sql).outer).toMatch(/ AS `Value`/);
  });

  it('keeps a caller alias', async () => {
    const q = await render(MetricsDataType.Sum, {}, { alias: 'Requests' });
    expect(split(q.sql).outer).toMatch(/ AS `Requests`/);
    expect(split(q.sql).outer).not.toMatch(/ AS `Value`/);
  });

  it('leaves an unaliased gauge select named after its aggregate, as upstream', async () => {
    const q = await render(MetricsDataType.Gauge);
    expect(split(q.sql).outer).not.toMatch(/ AS `Value`/);
  });
});
