import { translateExponentialHistogramCouchbase } from '@/couchbase/render/metrics/expHistogram';
import type { HistInput } from '@/couchbase/render/metrics/histogram';

import {
  type ExpHistPoint,
  normalizeScale,
  referenceExpHistogramCount,
  referenceExpHistogramQuantile,
} from './expHistogramReference';

const baseFrom = {
  databaseName: 'otel',
  scopeName: 'default',
  tableName: 'otel_metrics_exponential_histogram',
};

function input(
  overrides: Partial<HistInput> & {
    select: HistInput['select'];
  },
): HistInput {
  return {
    chartConfig: {
      from: baseFrom,
      select: [],
      timestampValueExpression: 'TimeUnix',
      connection: 'c',
      ...overrides.chartConfig,
    } as unknown as HistInput['chartConfig'],
    table: 'otel_metrics_exponential_histogram',
    nameFilter: "MetricName = 'parity.exponential'",
    from: baseFrom,
    ...overrides,
    select: overrides.select,
  };
}

function cteSql(
  result: ReturnType<typeof translateExponentialHistogramCouchbase>,
  i: number,
) {
  const clause = result.with[i];
  if (!clause?.sql) throw new Error(`missing with[${i}]`);
  return clause.sql;
}

describe('translateExponentialHistogramCouchbase', () => {
  it('emits count CTEs with parameters empty', () => {
    const result = translateExponentialHistogramCouchbase(
      input({ select: { aggFn: 'count', alias: 'value' } }),
    );
    expect(result.with.map(w => w.name)).toEqual(['source', 'metrics']);
    expect(cteSql(result, 0).sql).toContain('LAG');
    expect(cteSql(result, 1).sql).toContain('SUM(delta)');
    expect(cteSql(result, 0).params).toEqual({});
  });

  it('weaves dateRange into the source CTE with named params', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const to = new Date('2026-01-01T01:00:00.000Z');
    const result = translateExponentialHistogramCouchbase(
      input({
        select: { aggFn: 'count', alias: 'value' },
        chartConfig: {
          from: baseFrom,
          select: [],
          timestampValueExpression: 'TimeUnix',
          connection: 'c',
          dateRange: [from, to],
        } as unknown as HistInput['chartConfig'],
      }),
    );
    expect(cteSql(result, 0).sql).toContain('d.TimeUnix >= $p0');
    expect(cteSql(result, 0).sql).toContain('d.TimeUnix < $p1');
    expect(cteSql(result, 0).params).toEqual({
      p0: '2026-01-01T00:00:00.000000000Z',
      p1: '2026-01-01T01:00:00.000000000Z',
    });
  });

  it('emits quantile CTEs with a level parameter', () => {
    const result = translateExponentialHistogramCouchbase(
      input({ select: { aggFn: 'quantile', level: 0.95, alias: 'value' } }),
    );
    expect(result.with.map(w => w.name)).toEqual([
      'filtered_series',
      'min_scale',
      'series_with_normalized_scale',
      'normalized_deltas',
      'bucket_rows',
      'summed',
      'summed_buckets',
      'metrics',
    ]);
    expect(cteSql(result, 2).sql).toContain('POWER(2');
    expect(cteSql(result, 7).params).toEqual({ p0: 0.95 });
  });

  it('includes group and time bucket projections when configured', () => {
    const result = translateExponentialHistogramCouchbase(
      input({
        select: { aggFn: 'count', alias: 'value' },
        chartConfig: {
          from: baseFrom,
          select: [],
          timestampValueExpression: 'TimeUnix',
          connection: 'c',
          groupBy: 'ResourceAttributes.`service.name`',
          granularity: '5 minute',
        } as unknown as HistInput['chartConfig'],
      }),
    );
    expect(result.hasGroup).toBe(true);
    expect(result.hasBucket).toBe(true);
    expect(cteSql(result, 0).sql).toContain('group');
    expect(cteSql(result, 0).sql).toContain('__hdx_time_bucket');
  });

  it('throws the upstream message for unsupported aggFn', () => {
    expect(() =>
      translateExponentialHistogramCouchbase(
        input({ select: { aggFn: 'sum', alias: 'value' } }),
      ),
    ).toThrow(
      'sum is not currently supported for exponential histogram metrics',
    );
    expect(() =>
      translateExponentialHistogramCouchbase(
        input({ select: { aggFn: 'avg', alias: 'value' } }),
      ),
    ).toThrow(
      'avg is not currently supported for exponential histogram metrics',
    );
  });
});

describe('expHistogramReference', () => {
  const base: ExpHistPoint = {
    MetricName: 'm',
    TimeUnix: 1_000,
    StartTimeUnix: 900,
    AggregationTemporality: 1,
    Scale: 0,
    ZeroCount: 0,
    PositiveOffset: 0,
    PositiveBucketCounts: [1, 2, 4],
    NegativeOffset: 0,
    NegativeBucketCounts: [],
    Count: 7,
    seriesKey: 's1',
  };

  it('count sums delta-temporality counts', () => {
    const rows = referenceExpHistogramCount([
      { ...base, Count: 3 },
      { ...base, TimeUnix: 2_000, Count: 5 },
    ]);
    expect(rows).toEqual([{ value: 8 }]);
  });

  it('quantile at scale 0 matches hand-computed p50', () => {
    const rows = referenceExpHistogramQuantile([{ ...base }], 0.5);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.value).toBeCloseTo(2 ** 2.125, 9);
  });

  it('normalizes two scales into the coarser scale', () => {
    const a: ExpHistPoint = {
      ...base,
      Scale: 3,
      PositiveOffset: 0,
      PositiveBucketCounts: [1, 1, 1, 1, 1, 1, 1, 1],
      seriesKey: 'a',
    };
    const b: ExpHistPoint = {
      ...base,
      Scale: 1,
      PositiveOffset: 0,
      PositiveBucketCounts: [2, 2],
      seriesKey: 'b',
    };
    const norm = normalizeScale([a, b]);
    expect(norm.every(p => p.Scale === 1)).toBe(true);
    expect(norm[0]!.PositiveBucketCounts).toEqual([4, 4]);
    expect(norm[1]!.PositiveBucketCounts).toEqual([2, 2]);
  });

  it('drops all-zero buckets from quantile output', () => {
    const rows = referenceExpHistogramQuantile(
      [
        {
          ...base,
          ZeroCount: 0,
          PositiveBucketCounts: [0, 0],
          Count: 0,
        },
      ],
      0.5,
    );
    expect(rows).toEqual([]);
  });
});
