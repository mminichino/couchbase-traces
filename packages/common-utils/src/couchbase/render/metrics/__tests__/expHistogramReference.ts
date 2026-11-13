/**
 * TypeScript port of upstream translateExponentialHistogram (count + quantile).
 * Used only by unit and integration tests — not shipped in the query path.
 */

export type ExpHistPoint = {
  MetricName: string;
  TimeUnix: number;
  StartTimeUnix: number;
  AggregationTemporality: 1 | 2;
  Scale: number;
  ZeroCount: number;
  PositiveOffset: number;
  PositiveBucketCounts: number[];
  NegativeOffset: number;
  NegativeBucketCounts: number[];
  Count: number;
  seriesKey: string;
  group?: unknown;
  timeBucket?: string;
};

export type ExpHistAggResult = {
  timeBucket?: string;
  group?: unknown;
  value: number;
};

type NormPoint = {
  MetricName: string;
  TimeUnix: number;
  StartTimeUnix: number;
  AggregationTemporality: 1 | 2;
  Scale: number;
  ZeroCount: number;
  PositiveOffset: number;
  PositiveBucketCounts: number[];
  NegativeOffset: number;
  NegativeBucketCounts: number[];
  seriesKey: string;
  group?: unknown;
  timeBucket?: string;
};

function dimKey(p: { timeBucket?: string; group?: unknown }): string {
  return JSON.stringify([p.timeBucket ?? null, p.group ?? null]);
}

function floorDiv(i: number, d: number): number {
  return Math.floor(i / d);
}

/** Regroup buckets to a coarser scale (minimum Scale across the set). */
export function normalizeScale(points: ExpHistPoint[]): NormPoint[] {
  if (points.length === 0) return [];
  const normalizedScale = Math.min(...points.map(p => p.Scale));
  return points.map(p => {
    const s = p.Scale - normalizedScale;
    const d = 2 ** s;
    const side = (
      offset: number,
      counts: number[],
    ): { offset: number; counts: number[] } => {
      if (s === 0 || counts.length === 0) {
        return { offset, counts: [...counts] };
      }
      const n = counts.length;
      const newOffset = floorDiv(offset, d);
      const lastAbs = offset + n - 1;
      const newLast = floorDiv(lastAbs, d);
      const out: number[] = [];
      for (let j = 0; j <= newLast - newOffset; j++) {
        const start = Math.max(0, (newOffset + j) * d - offset);
        const end = Math.min(n, (newOffset + j + 1) * d - offset);
        let sum = 0;
        for (let k = start; k < end; k++) sum += counts[k] ?? 0;
        out.push(sum);
      }
      return { offset: newOffset, counts: out };
    };
    const pos = side(p.PositiveOffset, p.PositiveBucketCounts);
    const neg = side(p.NegativeOffset, p.NegativeBucketCounts);
    return {
      MetricName: p.MetricName,
      TimeUnix: p.TimeUnix,
      StartTimeUnix: p.StartTimeUnix,
      AggregationTemporality: p.AggregationTemporality,
      Scale: normalizedScale,
      ZeroCount: p.ZeroCount,
      PositiveOffset: pos.offset,
      PositiveBucketCounts: pos.counts,
      NegativeOffset: neg.offset,
      NegativeBucketCounts: neg.counts,
      seriesKey: p.seriesKey,
      group: p.group,
      timeBucket: p.timeBucket,
    };
  });
}

function alignPrev(
  prevOffset: number,
  prevCounts: number[],
  curOffset: number,
  curLen: number,
): number[] {
  const out = new Array(curLen).fill(0);
  for (let i = 0; i < curLen; i++) {
    const src = curOffset + i - prevOffset;
    if (src >= 0 && src < prevCounts.length) out[i] = prevCounts[src] ?? 0;
  }
  return out;
}

type DeltaRow = {
  timeBucket?: string;
  group?: unknown;
  Scale: number;
  ZeroCount: number;
  pos: [number, number][];
  neg: [number, number][];
};

function toPairs(offset: number, counts: number[]): [number, number][] {
  return counts.map((c, i) => [offset + i, c]);
}

function normalizedDeltas(normalized: NormPoint[]): DeltaRow[] {
  const bySeries = new Map<string, NormPoint[]>();
  for (const p of normalized) {
    const key = JSON.stringify([p.group ?? null, p.MetricName, p.seriesKey]);
    const list = bySeries.get(key) ?? [];
    list.push(p);
    bySeries.set(key, list);
  }
  for (const list of bySeries.values()) {
    list.sort((a, b) => a.TimeUnix - b.TimeUnix);
  }

  const out: DeltaRow[] = [];
  for (const list of bySeries.values()) {
    const cum = list.filter(p => p.AggregationTemporality === 2);
    for (let i = 0; i < cum.length; i++) {
      const cur = cum[i]!;
      const prev = i > 0 ? cum[i - 1]! : undefined;
      const nPos = cur.PositiveBucketCounts.length;
      const nNeg = cur.NegativeBucketCounts.length;
      const alignedPos = prev
        ? alignPrev(
            prev.PositiveOffset,
            prev.PositiveBucketCounts,
            cur.PositiveOffset,
            nPos,
          )
        : new Array(nPos).fill(0);
      const alignedNeg = prev
        ? alignPrev(
            prev.NegativeOffset,
            prev.NegativeBucketCounts,
            cur.NegativeOffset,
            nNeg,
          )
        : new Array(nNeg).fill(0);
      const posDeltas = cur.PositiveBucketCounts.map(
        (c, j) => c - (alignedPos[j] ?? 0),
      );
      const negDeltas = cur.NegativeBucketCounts.map(
        (c, j) => c - (alignedNeg[j] ?? 0),
      );
      const prevPosSum = prev
        ? prev.PositiveBucketCounts.reduce((a, b) => a + b, 0)
        : 0;
      const prevNegSum = prev
        ? prev.NegativeBucketCounts.reduce((a, b) => a + b, 0)
        : 0;
      const alignedPosSum = alignedPos.reduce((a, b) => a + b, 0);
      const alignedNegSum = alignedNeg.reduce((a, b) => a + b, 0);
      const posDecreased =
        posDeltas.some(x => x < 0) || prevPosSum > alignedPosSum;
      const negDecreased =
        negDeltas.some(x => x < 0) || prevNegSum > alignedNegSum;
      const useZero = !prev || cur.StartTimeUnix === cur.TimeUnix;
      const useCurrent =
        !useZero &&
        (cur.StartTimeUnix !== prev!.StartTimeUnix ||
          cur.ZeroCount < prev!.ZeroCount ||
          posDecreased ||
          negDecreased);
      out.push({
        timeBucket: cur.timeBucket,
        group: cur.group,
        Scale: cur.Scale,
        ZeroCount: useZero
          ? 0
          : useCurrent
            ? cur.ZeroCount
            : cur.ZeroCount - prev!.ZeroCount,
        pos: useZero
          ? []
          : toPairs(
              cur.PositiveOffset,
              useCurrent ? cur.PositiveBucketCounts : posDeltas,
            ),
        neg: useZero
          ? []
          : toPairs(
              cur.NegativeOffset,
              useCurrent ? cur.NegativeBucketCounts : negDeltas,
            ),
      });
    }
    for (const cur of list.filter(p => p.AggregationTemporality === 1)) {
      out.push({
        timeBucket: cur.timeBucket,
        group: cur.group,
        Scale: cur.Scale,
        ZeroCount: cur.ZeroCount,
        pos: toPairs(cur.PositiveOffset, cur.PositiveBucketCounts),
        neg: toPairs(cur.NegativeOffset, cur.NegativeBucketCounts),
      });
    }
  }
  return out;
}

function sumMap(pairs: [number, number][]): Map<number, number> {
  const m = new Map<number, number>();
  for (const [idx, c] of pairs) {
    m.set(idx, (m.get(idx) ?? 0) + c);
  }
  return m;
}

function summedBuckets(deltas: DeltaRow[]) {
  const groups = new Map<
    string,
    {
      timeBucket?: string;
      group?: unknown;
      Scale: number;
      zero: number;
      pos: Map<number, number>;
      neg: Map<number, number>;
    }
  >();
  for (const d of deltas) {
    const k = dimKey(d);
    let g = groups.get(k);
    if (!g) {
      g = {
        timeBucket: d.timeBucket,
        group: d.group,
        Scale: d.Scale,
        zero: 0,
        pos: new Map(),
        neg: new Map(),
      };
      groups.set(k, g);
    }
    g.Scale = Math.min(g.Scale, d.Scale);
    g.zero += d.ZeroCount;
    for (const [idx, c] of sumMap(d.pos)) {
      g.pos.set(idx, (g.pos.get(idx) ?? 0) + c);
    }
    for (const [idx, c] of sumMap(d.neg)) {
      g.neg.set(idx, (g.neg.get(idx) ?? 0) + c);
    }
  }
  return [...groups.values()].map(g => ({
    timeBucket: g.timeBucket,
    group: g.group,
    Scale: g.Scale,
    zero: g.zero,
    negPairs: [...g.neg.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([idx, c]) => [idx, c] as [number, number]),
    posPairs: [...g.pos.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([idx, c]) => [idx, c] as [number, number]),
  }));
}

function quantileFromBuckets(
  Scale: number,
  zero: number,
  negPairs: [number, number][],
  posPairs: [number, number][],
  level: number,
): number | null {
  const ordered: [number, number][] = [
    ...[...negPairs].reverse(),
    [0, zero],
    ...posPairs,
  ];
  const counts = ordered.map(p => p[1]);
  const cum: number[] = [];
  let running = 0;
  for (const c of counts) {
    running += c;
    cum.push(running);
  }
  const total = cum[cum.length - 1] ?? 0;
  if (total <= 0) return null;
  const rank = level * total;
  let sel = -1;
  for (let i = 0; i < counts.length; i++) {
    if ((counts[i] ?? 0) > 0 && (cum[i] ?? 0) >= rank) {
      sel = i;
      break;
    }
  }
  if (sel < 0) return null;
  const side = Math.sign(sel - negPairs.length);
  const idx = ordered[sel]![0];
  const prevCum = sel === 0 ? 0 : (cum[sel - 1] ?? 0);
  const fraction = (rank - prevCum) / counts[sel]!;
  if (side < 0) {
    return -(2 ** ((idx + 1 - fraction) * 2 ** -Scale));
  }
  if (side > 0) {
    return 2 ** ((idx + fraction) * 2 ** -Scale);
  }
  return 0;
}

export function referenceExpHistogramQuantile(
  points: ExpHistPoint[],
  level: number,
): ExpHistAggResult[] {
  const normalized = normalizeScale(points);
  const deltas = normalizedDeltas(normalized);
  const summed = summedBuckets(deltas);
  const results: ExpHistAggResult[] = [];
  for (const s of summed) {
    const value = quantileFromBuckets(
      s.Scale,
      s.zero,
      s.negPairs,
      s.posPairs,
      level,
    );
    if (value == null) continue;
    results.push({
      timeBucket: s.timeBucket,
      group: s.group,
      value,
    });
  }
  return results;
}

export function referenceExpHistogramCount(
  points: ExpHistPoint[],
): ExpHistAggResult[] {
  const bySeries = new Map<string, ExpHistPoint[]>();
  for (const p of points) {
    const key = JSON.stringify([
      p.group ?? null,
      p.MetricName,
      p.seriesKey,
      p.AggregationTemporality,
    ]);
    const list = bySeries.get(key) ?? [];
    list.push(p);
    bySeries.set(key, list);
  }
  const totals = new Map<string, ExpHistAggResult & { value: number }>();
  for (const list of bySeries.values()) {
    list.sort((a, b) => a.TimeUnix - b.TimeUnix);
    for (let i = 0; i < list.length; i++) {
      const cur = list[i]!;
      const prev = i > 0 ? list[i - 1]! : undefined;
      let delta = 0;
      if (cur.AggregationTemporality === 1) {
        delta = cur.Count;
      } else if (cur.AggregationTemporality === 2) {
        if (!prev || cur.StartTimeUnix === cur.TimeUnix) {
          delta = 0;
        } else if (
          cur.StartTimeUnix !== prev.StartTimeUnix ||
          cur.Count < prev.Count
        ) {
          delta = cur.Count;
        } else {
          delta = cur.Count - prev.Count;
        }
      }
      const k = dimKey(cur);
      const existing = totals.get(k);
      if (existing) {
        existing.value += delta;
      } else {
        totals.set(k, {
          timeBucket: cur.timeBucket,
          group: cur.group,
          value: delta,
        });
      }
    }
  }
  return [...totals.values()];
}
