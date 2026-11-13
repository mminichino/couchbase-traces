import { type SqlPP, sqlpp } from '@/couchbase/sqlpp';

/** Layout confirmed against Couchbase date-function format strings. */
export const SQLPP_DATE_FORMAT = '1111-11-11T11:11:11.111Z';

/**
 * `DATE_TRUNC_MILLIS(..., "week")` truncates to Sunday. ISO weeks start on
 * Monday, so buckets add one day. Recorded against 2026-01-01 → 2025-12-28.
 */
export const WEEK_ALIGN_OFFSET_MS: number = 86_400_000;

export type TimeFormat = 'iso8601' | 'epoch_millis';

export type Granularity = {
  unit: 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month';
  n: number;
  /** Null for calendar units that are not a fixed number of milliseconds. */
  ms: number | null;
};

/** 30-character ISO-8601 UTC form used by the Phase 5 documents. */
export function toIso30(d: Date): string {
  const iso = d.toISOString();
  const dot = iso.indexOf('.');
  const head = iso.slice(0, dot);
  const fraction = iso.slice(dot + 1, iso.length - 1);
  return `${head}.${fraction.padEnd(9, '0')}Z`;
}

export function parseGranularity(g: string): Granularity {
  const match = /^(\d+) (second|minute|hour|day|week|month)$/.exec(g.trim());
  if (!match) {
    throw new Error(`Unsupported granularity: ${g}`);
  }
  const n = Number(match[1]);
  const unit = match[2];
  const base = unitMs(unit);
  if (base === undefined || !isUnit(unit)) {
    throw new Error(`Unsupported granularity: ${g}`);
  }
  return { unit, n, ms: base == null ? null : base * n };
}

function isUnit(unit: string): unit is Granularity['unit'] {
  return (
    unit === 'second' ||
    unit === 'minute' ||
    unit === 'hour' ||
    unit === 'day' ||
    unit === 'week' ||
    unit === 'month'
  );
}

function unitMs(unit: string): number | null | undefined {
  switch (unit) {
    case 'second':
      return 1000;
    case 'minute':
      return 60_000;
    case 'hour':
      return 3_600_000;
    case 'day':
      return 86_400_000;
    case 'week':
      return 7 * 86_400_000;
    case 'month':
      return null;
    default:
      return undefined;
  }
}

export function timeRangePredicate(
  tsExpr: string,
  format: TimeFormat,
  from: Date,
  to: Date,
  opts?: { inclusiveStart?: boolean; inclusiveEnd?: boolean },
): SqlPP {
  const startOp = opts?.inclusiveStart === false ? '>' : '>=';
  const endOp = opts?.inclusiveEnd ? '<=' : '<';
  if (format === 'epoch_millis') {
    return sqlpp`${{ Raw: tsExpr }} ${{ Raw: startOp }} ${{ Param: from.getTime() }} AND ${{ Raw: tsExpr }} ${{ Raw: endOp }} ${{ Param: to.getTime() }}`;
  }
  return sqlpp`${{ Raw: tsExpr }} ${{ Raw: startOp }} ${{ Param: toIso30(from) }} AND ${{ Raw: tsExpr }} ${{ Raw: endOp }} ${{ Param: toIso30(to) }}`;
}

export function tsMillisExpr(tsExpr: string, format: TimeFormat): string {
  return format === 'epoch_millis' ? tsExpr : `STR_TO_MILLIS(${tsExpr})`;
}

/**
 * Time-bucket expression. Granularity constants and the date format are
 * embedded as literals so SELECT and GROUP BY can share the same text —
 * nesting the expression twice through `sqlpp` would renumber `$pN` and
 * make N1QL treat them as different expressions (error 4210).
 */
export function timeBucketExpr(
  tsExpr: string,
  format: TimeFormat,
  granularity: Granularity,
): SqlPP {
  const millis = tsMillisExpr(tsExpr, format);
  const fmtLit = JSON.stringify(SQLPP_DATE_FORMAT);
  if (granularity.unit === 'week' || granularity.unit === 'month') {
    const partLit = JSON.stringify(granularity.unit);
    const shift =
      granularity.unit === 'week' && WEEK_ALIGN_OFFSET_MS !== 0
        ? ` + ${WEEK_ALIGN_OFFSET_MS}`
        : '';
    return sqlpp`MILLIS_TO_UTC(DATE_TRUNC_MILLIS(${{ Raw: millis }}, ${{ Raw: partLit }})${{ Raw: shift }}, ${{ Raw: fmtLit }})`;
  }
  if (granularity.ms == null) {
    throw new Error(`Cannot bucket by ${granularity.n} ${granularity.unit}`);
  }
  const msLit = String(granularity.ms);
  return sqlpp`MILLIS_TO_UTC(FLOOR(${{ Raw: millis }} / ${{ Raw: msLit }}) * ${{ Raw: msLit }}, ${{ Raw: fmtLit }})`;
}
