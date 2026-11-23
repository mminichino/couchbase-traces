import { renderChartConfigCouchbase } from '@/couchbase/render';
import { seriesKeyExpr } from '@/couchbase/render/metrics/histogram';
import { DisplayType, MetricsDataType } from '@/types';

import { metadata } from './defectFixtures';

// D21: upstream core/histogram.ts translateHistogramQuantile. A cumulative
// series' first point contributes a zero delta (`arrayWithConstant(…, 0)`),
// a new bucket layout or a decrease takes the current counts, and a
// bucket/group with no observations has no row (`WHERE length(point) > 1
// AND total > 0`) instead of a NULL value.

const SERIES = `${seriesKeyExpr()}, d.AggregationTemporality`;
const LAG_COUNTS = `LAG(d.BucketCounts) OVER (PARTITION BY ${SERIES} ORDER BY TimeUnix)`;
const LAG_BOUNDS = `LAG(d.ExplicitBounds) OVER (PARTITION BY ${SERIES} ORDER BY TimeUnix)`;

const sqlOf = async (extra: Record<string, unknown> = {}) =>
  (
    await renderChartConfigCouchbase(
      {
        displayType: DisplayType.Line,
        connection: 'c',
        metricTables: { histogram: 'otel_metrics_histogram' },
        from: { databaseName: 'default', tableName: '' },
        select: [
          {
            aggFn: 'quantile',
            level: 0.5,
            aggCondition: '',
            valueExpression: 'Value',
            metricName: 'm',
            metricType: MetricsDataType.Histogram,
          },
        ],
        where: '',
        timestampValueExpression: 'TimeUnix',
        dateRange: [new Date('2025-02-12'), new Date('2025-02-14')],
        granularity: '1 minute',
        ...extra,
      } as never,
      metadata,
      undefined,
    )
  ).sql;

const rates = (sql: string) =>
  sql.slice(sql.indexOf('CASE WHEN d.'), sql.indexOf(' AS rates'));

describe('D21 histogram quantile deltas and empty buckets', () => {
  // A window clause cannot see the select's own aliases: `AttributesHash`
  // there reads as MISSING and puts every series in one partition.
  it.each([
    ['quantile', {}],
    [
      'count',
      {
        select: [
          {
            aggFn: 'count',
            aggCondition: '',
            valueExpression: 'Value',
            metricName: 'm',
            metricType: MetricsDataType.Histogram,
          },
        ],
      },
    ],
  ])(
    'partitions the %s deltas by series expressions, not aliases',
    async (_l, extra) => {
      const sql = await sqlOf({ ...extra, groupBy: 'ServiceName' });
      expect(sql).not.toContain('PARTITION BY AttributesHash');
      expect(sql).toContain(`OVER (PARTITION BY [ServiceName], ${SERIES}`);
    },
  );

  it('partitions the count deltas by bucket layout, as upstream', async () => {
    const sql = await sqlOf({
      select: [
        {
          aggFn: 'count',
          aggCondition: '',
          valueExpression: 'Value',
          metricName: 'm',
          metricType: MetricsDataType.Histogram,
        },
      ],
    });
    expect(sql).toContain(
      `LAG(TONUMBER(\`Count\`)) OVER (PARTITION BY ${SERIES}, d.ExplicitBounds ORDER BY TimeUnix)`,
    );
  });
  it('takes a zero delta for the first point of a cumulative series', async () => {
    expect(
      rates(await sqlOf()).startsWith(
        `CASE WHEN d.AggregationTemporality = 2 AND ${LAG_COUNTS} IS NULL THEN (ARRAY 0 FOR c IN d.BucketCounts END) `,
      ),
    ).toBe(true);
  });

  it('takes the current counts for delta temporality, a first non-cumulative point, a new layout or a reset', async () => {
    expect(rates(await sqlOf())).toContain(
      `WHEN d.AggregationTemporality = 1 OR ${LAG_COUNTS} IS NULL OR d.ExplicitBounds != ${LAG_BOUNDS} OR ARRAY_LENGTH(`,
    );
  });

  it('sorts buckets by index, keeping the NULL overflow bound last', async () => {
    const sql = await sqlOf();
    expect(sql).toContain('ARRAY_SORT(ARRAY_AGG([i, bound, rate]))');
    expect(sql).toContain('IFMISSING(s.ExplicitBounds[i], NULL) AS bound');
    expect(sql).not.toContain('1e12');
  });

  it.each([
    ['a time series', {}],
    [
      'a grouped table',
      {
        displayType: DisplayType.Table,
        granularity: undefined,
        groupBy: 'ServiceName',
      },
    ],
    ['a number', { displayType: DisplayType.Number, granularity: undefined }],
  ])('drops buckets with no observations from %s', async (_label, extra) => {
    const sql = await sqlOf(extra);
    expect(sql).toContain(') AS m WHERE m.n > 1 AND m.total > 0)');
    expect(sql).toContain('COUNT(1) AS n, SUM(rate) AS total FROM agg');
  });
});
