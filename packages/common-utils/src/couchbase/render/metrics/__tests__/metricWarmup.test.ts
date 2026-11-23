import { renderChartConfigCouchbase } from '@/couchbase/render';
import { toIso30 } from '@/couchbase/time';
import { DisplayType, MetricsDataType } from '@/types';

// D23: upstream renderChartConfig weaves `includedDataInterval` (the chart
// granularity; 'auto' sized from the range) into the Sum, Histogram, and
// Exponential Histogram source WHERE:
//   ts >= toStartOfInterval(start, I) - I AND ts <= toStartOfInterval(end, I) + I
// (`<=` is upstream's default-inclusive end, which the port matches since D26)
// so the first bucket has a prior point to subtract, and the outer query
// keeps the requested range on the time bucket so the look-back rows are not
// returned. Gauge and non-timeseries charts read the requested range only.

const START = new Date('2025-02-12T00:12:34Z');
const END = new Date('2025-02-14T00:12:34Z');

const TABLES = {
  gauge: 'otel_metrics_gauge',
  sum: 'otel_metrics_sum',
  histogram: 'otel_metrics_histogram',
  'exponential histogram': 'otel_metrics_exponential_histogram',
};

const render = (
  metricType: MetricsDataType,
  extra: Record<string, unknown> = {},
) =>
  renderChartConfigCouchbase(
    {
      displayType: DisplayType.Line,
      connection: 'c',
      from: { databaseName: 'otel', scopeName: 'default', tableName: '' },
      metricTables: TABLES,
      select: [
        {
          aggFn:
            metricType === MetricsDataType.Histogram ||
            metricType === MetricsDataType.ExponentialHistogram
              ? 'count'
              : 'sum',
          metricName: 'm',
          metricType,
          valueExpression: 'Value',
          aggCondition: '',
        },
      ],
      where: '',
      timestampValueExpression: 'TimeUnix',
      dateRange: [START, END],
      granularity: '1 minute',
      ...extra,
    } as never,
    { getColumns: async () => [] } as never,
    undefined,
  );

/** The source CTE's time predicate with its bound parameter values. */
async function sourceBounds(
  metricType: MetricsDataType,
  extra: Record<string, unknown> = {},
) {
  const q = await render(metricType, extra);
  const m = /d\.TimeUnix (>=?) \$(p\d+) AND d\.TimeUnix (<=?) \$(p\d+)/.exec(
    q.sql,
  );
  if (!m) throw new Error(`no source time predicate in ${q.sql}`);
  return {
    sql: q.sql,
    startOp: m[1],
    endOp: m[3],
    from: q.params[m[2]],
    to: q.params[m[4]],
  };
}

const iso = (s: string) => toIso30(new Date(s));

describe('D23 metric source warm-up window', () => {
  it.each([
    MetricsDataType.Sum,
    MetricsDataType.Histogram,
    MetricsDataType.ExponentialHistogram,
  ])(
    'reads one interval either side of a %s timeseries range',
    async metricType => {
      expect(await sourceBounds(metricType)).toMatchObject({
        startOp: '>=',
        endOp: '<=',
        from: iso('2025-02-12T00:11:00Z'),
        to: iso('2025-02-14T00:13:00Z'),
      });
    },
  );

  it('sizes an auto granularity from the range, as upstream', async () => {
    // Two days auto-size to 1 hour buckets (convertDateRangeToGranularityString).
    expect(
      await sourceBounds(MetricsDataType.Histogram, { granularity: 'auto' }),
    ).toMatchObject({
      from: iso('2025-02-11T23:00:00Z'),
      to: iso('2025-02-14T01:00:00Z'),
    });
  });

  it('aligns week and month intervals to their calendar start', async () => {
    // Upstream's 1 WEEK case: toStartOfInterval is Monday.
    expect(
      await sourceBounds(MetricsDataType.Sum, { granularity: '1 week' }),
    ).toMatchObject({
      from: iso('2025-02-03T00:00:00Z'),
      to: iso('2025-02-17T00:00:00Z'),
    });
    expect(
      await sourceBounds(MetricsDataType.Sum, { granularity: '1 month' }),
    ).toMatchObject({
      from: iso('2025-01-01T00:00:00Z'),
      to: iso('2025-03-01T00:00:00Z'),
    });
  });

  it('keeps the requested exclusive start when the caller asks for one', async () => {
    expect(
      await sourceBounds(MetricsDataType.Sum, {
        dateRangeStartInclusive: false,
        dateRangeEndInclusive: false,
      }),
    ).toMatchObject({ startOp: '>', endOp: '<' });
  });

  it.each([
    ['a gauge', MetricsDataType.Gauge, {}],
    [
      'a non-timeseries histogram',
      MetricsDataType.Histogram,
      { displayType: DisplayType.Number, granularity: undefined },
    ],
    [
      'a non-timeseries sum',
      MetricsDataType.Sum,
      { displayType: DisplayType.Number, granularity: undefined },
    ],
  ])('reads only the requested range for %s', async (_l, metricType, extra) => {
    expect(await sourceBounds(metricType, extra)).toMatchObject({
      startOp: '>=',
      endOp: '<=',
      from: toIso30(START),
      to: toIso30(END),
    });
  });

  it('drops the sum look-back buckets with the requested range on the time bucket', async () => {
    const q = await render(MetricsDataType.Sum);
    const outer = q.sql.slice(q.sql.lastIndexOf('FROM `Bucketed`'));
    const m =
      /d\.__hdx_time_bucket2 >= \$(p\d+) AND d\.__hdx_time_bucket2 <= \$(p\d+)/.exec(
        outer,
      );
    expect(m).not.toBeNull();
    expect(q.params[m![1]]).toBe(toIso30(START));
    expect(q.params[m![2]]).toBe(toIso30(END));
  });

  it.each([MetricsDataType.Sum, MetricsDataType.Histogram])(
    'binds ISO bucket bounds for a %s source stored as epoch millis',
    async metricType => {
      // Bucket aliases are ISO strings; numeric bounds would match nothing.
      const q = await render(metricType, { timestampFormat: 'epoch_millis' });
      expect(Object.values(q.params)).toEqual(
        expect.arrayContaining([
          START.getTime() - 34_000 - 60_000,
          toIso30(START),
          toIso30(END),
        ]),
      );
    },
  );
});
