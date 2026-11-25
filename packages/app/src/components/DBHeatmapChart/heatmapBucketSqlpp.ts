/**
 * ClickHouse `widthBucket(v, lo, hi, n)` in SQL++: 0 below `lo`, `n + 1` at or
 * above `hi`, else `floor((v - lo) / (hi - lo) * n) + 1`. SQL++ has no
 * widthBucket, greatest, or toFloat64.
 */
export function widthBucketSqlpp(
  v: string,
  lo: string | number,
  hi: string | number,
  n: number,
): string {
  return `(CASE WHEN ${v} < ${lo} THEN 0 WHEN ${v} >= ${hi} THEN ${n + 1} ELSE FLOOR((${v} - ${lo}) / (${hi} - ${lo}) * ${n}) + 1 END)`;
}

/** Log-scale buckets: `widthBucket` over `ln` of the clamped value. */
export function logBucketSqlpp(
  value: string,
  effectiveMin: string | number,
  max: string | number,
  n: number,
): string {
  return widthBucketSqlpp(
    `LN(GREATEST(TONUMBER(${value}), ${effectiveMin}))`,
    `LN(${effectiveMin})`,
    `LN(${max})`,
    n,
  );
}
