import { CouchbaseUnsupportedError } from '@/couchbase/errors';
import { type SqlPP, sqlpp } from '@/couchbase/sqlpp';

/**
 * Heatmap value-axis bucketing. Boundary lists come from TypeScript (same as
 * upstream); SQL++ applies FLOOR arithmetic over those bounds.
 */
export function heatmapBucketExpr(
  valueExpr: string,
  bounds: number[],
  mode: 'linear' | 'logarithmic' = 'linear',
): SqlPP {
  if (bounds.length < 2) {
    throw new CouchbaseUnsupportedError('charts: heatmap bounds');
  }
  if (mode === 'logarithmic') {
    const lo = bounds[0];
    const hi = bounds[bounds.length - 1];
    const n = bounds.length - 1;
    // Approximate log bucket index; callers pass precomputed bounds.
    return sqlpp`FLOOR((LN(TONUMBER(${{ Raw: valueExpr }})) - LN(${{ Param: lo }})) / ((LN(${{ Param: hi }}) - LN(${{ Param: lo }})) / ${{ Param: n }}))`;
  }
  const width = bounds[1] - bounds[0];
  return sqlpp`FLOOR((TONUMBER(${{ Raw: valueExpr }}) - ${{ Param: bounds[0] }}) / ${{ Param: width }})`;
}

export function assertHeatmapSupported(): void {
  // Heatmap select paths are available for charts; keep as no-op marker.
}
