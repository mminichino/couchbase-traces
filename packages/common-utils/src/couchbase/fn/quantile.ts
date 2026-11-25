import type { SqlPP } from '@/couchbase/sqlpp';

/** Linear-interpolation quantile of a sorted numeric sample. `p` is in [0, 1]. */
export function quantileValue(sorted: number[], p: number): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  const r = p * (n - 1);
  const lo = sorted.at(Math.floor(r));
  const hi = sorted.at(Math.ceil(r));
  if (lo == null || hi == null) return null;
  return lo + (r - Math.floor(r)) * (hi - lo);
}

/**
 * Linear-interpolation quantile of a sorted SQL++ array, as `quantileValue`
 * and ClickHouse's `quantile` (reservoir, interpolated). `sorted` is repeated
 * as text; NULL when the array is empty or NULL. `level` is an expression,
 * normally a named parameter.
 */
export function sortedArrayQuantile(sorted: string, level: string): string {
  const n = `ARRAY_LENGTH(${sorted})`;
  const r = `(${level} * (${n} - 1))`;
  return `CASE WHEN ${n} = 0 THEN NULL ELSE ${sorted}[FLOOR(${r})] + (${r} - FLOOR(${r})) * (${sorted}[CEIL(${r})] - ${sorted}[FLOOR(${r})]) END`;
}

/**
 * One aggregate expression. `<A>` is repeated as text; the engine computes
 * the aggregate once per group. `$p0` is the quantile level.
 */
export function quantile(p: number, x: string, c = 'TRUE'): SqlPP {
  const sorted = `ARRAY_SORT(ARRAY v FOR v IN ARRAY_AGG(CASE WHEN ${c} AND ISNUMBER(${x}) THEN ${x} END) WHEN v IS NOT NULL END)`;
  return {
    statement: sortedArrayQuantile(sorted, '$p0'),
    parameters: { p0: p },
  };
}

/**
 * Histogram quantile matching `core/histogram.ts`: cumulative counts, the
 * first bucket whose cumulative count exceeds `p * total`, then linear
 * interpolation. Indexes in this function are 1-based, like the legacy store
 * query this ports.
 */
export function histogramQuantileValue(
  p: number,
  bounds: number[],
  counts: number[],
): number | null {
  if (counts.length === 0) return null;
  const points: { count: number; bound: number }[] = [];
  let sum = 0;
  const width = Math.max(counts.length, bounds.length);
  for (let i = 0; i < width; i++) {
    sum += counts.at(i) ?? 0;
    points.push({
      count: sum,
      bound: bounds.at(i) ?? Number.POSITIVE_INFINITY,
    });
  }
  const total = points.at(-1)?.count ?? 0;
  if (points.length <= 1 || total <= 0) return null;
  const rank = p * total;
  let upperIdx = 0;
  for (let i = 0; i < points.length; i++) {
    if ((points.at(i)?.count ?? 0) > rank) {
      upperIdx = i + 1;
      break;
    }
  }
  const at = (index: number) =>
    index >= 1 && index <= points.length ? points.at(index - 1) : undefined;
  const upper = at(upperIdx);
  const upperBound = upper?.bound ?? Number.POSITIVE_INFINITY;
  const upperCount = upper?.count ?? 0;
  const lowerBound =
    upperIdx > 1
      ? (at(upperIdx - 1)?.bound ?? Number.POSITIVE_INFINITY)
      : (upper?.bound ?? 0) > 0
        ? 0
        : Number.POSITIVE_INFINITY;
  const lowerCount = lowerBound === 0 ? 0 : (at(upperIdx - 1)?.count ?? 0);
  if (!Number.isFinite(upperBound))
    return at(Math.max(upperIdx - 1, 1))?.bound ?? null;
  if (!Number.isFinite(lowerBound)) return points.at(0)?.bound ?? null;
  const span = upperCount - lowerCount;
  if (span === 0) return lowerBound;
  return lowerBound + ((upperBound - lowerBound) * (rank - lowerCount)) / span;
}

/**
 * SQL++ form of `histogramQuantileValue`, same cases in the same order.
 * The points array is repeated because a scalar expression cannot bind a
 * LET, and each copy gets its own comprehension variable: SQL++ rejects a
 * repeated name in one statement. Indexes are 0-based here; a NULL or
 * missing bound is the +Inf overflow bucket.
 */
export function histogramQuantile(
  p: number,
  boundsExpr: string,
  countsExpr: string,
): SqlPP {
  let seq = 0;
  const name = () => {
    seq += 1;
    return `h${seq}`;
  };
  const points = () => {
    const v = name();
    return `(ARRAY {"c": ARRAY_SUM((${countsExpr})[0:${v}+1]), "b": IFMISSINGORNULL((${boundsExpr})[${v}], NULL)} FOR ${v} IN ARRAY_RANGE(0, GREATEST(ARRAY_LENGTH(${countsExpr}), ARRAY_LENGTH(${boundsExpr}))) END)`;
  };
  const total = () =>
    `IFMISSINGORNULL(${points()}[ARRAY_LENGTH(${points()})-1].c, 0)`;
  const rank = () => `($p0 * ${total()})`;
  // First index whose cumulative count exceeds the rank; MISSING when none.
  const upper = () => {
    const v = name();
    return `(ARRAY ${v} FOR ${v} IN ARRAY_RANGE(0, ARRAY_LENGTH(${points()})) WHEN ${points()}[${v}].c > ${rank()} END)[0]`;
  };
  const at = (index: string, field: 'b' | 'c') =>
    `${points()}[${index}].${field}`;
  const prev = () => `${upper()}-1`;
  const lowerBound = () =>
    `(CASE WHEN ${upper()} >= 1 THEN ${at(prev(), 'b')} ELSE 0 END)`;
  const lowerCount = () =>
    `(CASE WHEN ${lowerBound()} = 0 THEN 0 ELSE ${at(prev(), 'c')} END)`;
  const span = () => `(${at(upper(), 'c')} - ${lowerCount()})`;
  const statement = [
    `CASE WHEN ARRAY_LENGTH(${countsExpr}) = 0 OR ARRAY_LENGTH(${points()}) <= 1 OR ${total()} <= 0 THEN NULL`,
    // Upper bound +Inf: the previous bucket's bound (the first, if none).
    `WHEN ${upper()} IS MISSING THEN ${at('0', 'b')}`,
    `WHEN ${at(upper(), 'b')} IS NOT VALUED THEN ${at(`GREATEST(${prev()}, 0)`, 'b')}`,
    // Lower bound +Inf: the first bucket's bound.
    `WHEN (${upper()} >= 1 AND ${at(prev(), 'b')} IS NOT VALUED) OR (${upper()} = 0 AND NOT (${at('0', 'b')} > 0)) THEN ${at('0', 'b')}`,
    `WHEN ${span()} = 0 THEN ${lowerBound()}`,
    `ELSE ${lowerBound()} + ((${at(upper(), 'b')} - ${lowerBound()}) * (${rank()} - ${lowerCount()})) / ${span()} END`,
  ].join(' ');
  return { statement, parameters: { p0: p } };
}
