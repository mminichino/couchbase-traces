/**
 * Exponential-histogram fixtures shared by the live-cluster suites. Ports
 * upstream api/src/clickhouse/__tests__/fixtures.ts
 * bucketExponentialHistogramObservations and seedExponentialHistogramMetric.
 */
import { toIso30 } from '@/couchbase/time';

/** Upstream bucketExponentialHistogramObservations. */
export function observations(values: number[], scale = 0) {
  const pos = new Map<number, number>();
  const neg = new Map<number, number>();
  let zero = 0;
  for (const v of values) {
    if (v === 0) {
      zero += 1;
      continue;
    }
    const buckets = v > 0 ? pos : neg;
    const i = Math.ceil(Math.log2(Math.abs(v)) * 2 ** scale) - 1;
    buckets.set(i, (buckets.get(i) ?? 0) + 1);
  }
  const dense = (m: Map<number, number>) => {
    if (m.size === 0) return { offset: 0, counts: [] as number[] };
    const keys = [...m.keys()];
    const offset = Math.min(...keys);
    const counts = Array<number>(Math.max(...keys) - offset + 1).fill(0);
    for (const [k, c] of m) counts[k - offset] = c;
    return { offset, counts };
  };
  const p = dense(pos);
  const n = dense(neg);
  return {
    Scale: scale,
    Count: values.length,
    Sum: values.reduce((a, b) => a + b, 0),
    ZeroCount: zero,
    PositiveOffset: p.offset,
    PositiveBucketCounts: p.counts,
    NegativeOffset: n.offset,
    NegativeBucketCounts: n.counts,
  };
}

export type ExpPoint = {
  /** Seconds from the suite's reference time. */
  at: number;
  start?: number;
  attrs?: Record<string, string>;
  values: number[];
  scale?: number;
};

/**
 * Upstream seedExponentialHistogramMetric documents: StartTimeUnix defaults
 * to the first point's time.
 */
export function expMetric(
  plus: (seconds: number) => Date,
  name: string,
  points: ExpPoint[],
  temporality = 2,
) {
  const start = points[0]?.start ?? points[0]?.at ?? 0;
  return points.map(p => ({
    MetricName: name,
    ServiceName: 'test-service',
    ResourceAttributes: {},
    ScopeAttributes: {},
    Attributes: p.attrs ?? {},
    AggregationTemporality: temporality,
    StartTimeUnix: toIso30(plus(p.start ?? start)),
    TimeUnix: toIso30(plus(p.at)),
    ...observations(p.values, p.scale),
  }));
}
