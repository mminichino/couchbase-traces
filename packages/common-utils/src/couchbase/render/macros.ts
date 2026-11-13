import { sqlpp } from '@/couchbase/sqlpp';
import {
  parseGranularity,
  SQLPP_DATE_FORMAT,
  timeBucketExpr,
  timeRangePredicate,
  toIso30,
} from '@/couchbase/time';

/** Trusted date-format literal for macro expansions. */
const FMT = JSON.stringify(SQLPP_DATE_FORMAT);

export type MacroContext = {
  startDateMilliseconds: number;
  endDateMilliseconds: number;
  intervalSeconds: number;
  timestampFormat?: 'iso8601' | 'epoch_millis';
  filtersSql?: string;
  sourceKeyspace?: string;
};

/**
 * Expand raw-SQL macros to SQL++ per Phase 7 §5.10.
 * Named parameters use $startDateMilliseconds / $endDateMilliseconds /
 * $intervalSeconds (never `__` prefixes).
 */
export function expandMacrosCouchbase(
  sql: string,
  ctx: MacroContext,
): { sql: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = {
    startDateMilliseconds: ctx.startDateMilliseconds,
    endDateMilliseconds: ctx.endDateMilliseconds,
    intervalSeconds: ctx.intervalSeconds,
  };
  const format = ctx.timestampFormat ?? 'iso8601';
  const gran = parseGranularity(
    ctx.intervalSeconds >= 86400
      ? `${Math.floor(ctx.intervalSeconds / 86400)} day`
      : ctx.intervalSeconds >= 3600
        ? `${Math.floor(ctx.intervalSeconds / 3600)} hour`
        : ctx.intervalSeconds >= 60
          ? `${Math.floor(ctx.intervalSeconds / 60)} minute`
          : `${ctx.intervalSeconds} second`,
  );

  let out = sql;
  const replaceAll = (
    pattern: RegExp,
    replacer: (...args: string[]) => string,
  ) => {
    out = out.replace(pattern, (...args) => replacer(...args));
  };

  // Bound macros emit 30-char ISO parameters. MILLIS_TO_UTC drops the
  // fractional second on exact seconds, and those shorter strings do not
  // lexicographically compare with Phase 5's 30-char Timestamp values.
  replaceAll(/\$__fromTime_ms\b/g, () => {
    params.fromTimeMsIso = toIso30(new Date(ctx.startDateMilliseconds));
    return '$fromTimeMsIso';
  });
  replaceAll(/\$__toTime_ms\b/g, () => {
    params.toTimeMsIso = toIso30(new Date(ctx.endDateMilliseconds));
    return '$toTimeMsIso';
  });
  replaceAll(/\$__fromTime\b/g, () => {
    const floored =
      ctx.startDateMilliseconds - (ctx.startDateMilliseconds % 1000);
    params.fromTimeIso = toIso30(new Date(floored));
    return '$fromTimeIso';
  });
  replaceAll(/\$__toTime\b/g, () => {
    const floored = ctx.endDateMilliseconds - (ctx.endDateMilliseconds % 1000);
    params.toTimeIso = toIso30(new Date(floored));
    return '$toTimeIso';
  });
  replaceAll(/\$__interval_s\b/g, () => `$intervalSeconds`);
  replaceAll(/\$__filters\b/g, () => ctx.filtersSql?.trim() || 'TRUE');

  replaceAll(/\$__timeFilter_ms\(([^)]+)\)/g, (_m, col) => {
    const pred = timeRangePredicate(
      col.trim(),
      format,
      new Date(ctx.startDateMilliseconds),
      new Date(ctx.endDateMilliseconds),
      { inclusiveEnd: true },
    );
    Object.assign(params, pred.parameters);
    return pred.statement;
  });
  replaceAll(/\$__timeFilter\(([^)]+)\)/g, (_m, col) => {
    const start =
      ctx.startDateMilliseconds - (ctx.startDateMilliseconds % 1000);
    const end = ctx.endDateMilliseconds - (ctx.endDateMilliseconds % 1000);
    const pred = timeRangePredicate(
      col.trim(),
      format,
      new Date(start),
      new Date(end),
      { inclusiveEnd: true },
    );
    Object.assign(params, pred.parameters);
    return pred.statement;
  });
  replaceAll(/\$__dateFilter\(([^)]+)\)/g, (_m, col) => {
    const c = col.trim();
    return `SUBSTR(${c}, 0, 10) >= SUBSTR(MILLIS_TO_UTC($startDateMilliseconds, ${FMT}), 0, 10) AND SUBSTR(${c}, 0, 10) <= SUBSTR(MILLIS_TO_UTC($endDateMilliseconds, ${FMT}), 0, 10)`;
  });
  replaceAll(
    /\$__dateTimeFilter\(([^,]+),\s*([^)]+)\)/g,
    (_m, dateCol, timeCol) => {
      const dateFilter = `SUBSTR(${dateCol.trim()}, 0, 10) >= SUBSTR(MILLIS_TO_UTC($startDateMilliseconds, ${FMT}), 0, 10) AND SUBSTR(${dateCol.trim()}, 0, 10) <= SUBSTR(MILLIS_TO_UTC($endDateMilliseconds, ${FMT}), 0, 10)`;
      const pred = timeRangePredicate(
        timeCol.trim(),
        format,
        new Date(ctx.startDateMilliseconds),
        new Date(ctx.endDateMilliseconds),
        { inclusiveEnd: true },
      );
      Object.assign(params, pred.parameters);
      return `(${dateFilter}) AND (${pred.statement})`;
    },
  );
  replaceAll(/\$__dt\(([^,]+),\s*([^)]+)\)/g, (_m, dateCol, timeCol) => {
    // Same as dateTimeFilter
    const dateFilter = `SUBSTR(${dateCol.trim()}, 0, 10) >= SUBSTR(MILLIS_TO_UTC($startDateMilliseconds, ${FMT}), 0, 10) AND SUBSTR(${dateCol.trim()}, 0, 10) <= SUBSTR(MILLIS_TO_UTC($endDateMilliseconds, ${FMT}), 0, 10)`;
    const pred = timeRangePredicate(
      timeCol.trim(),
      format,
      new Date(ctx.startDateMilliseconds),
      new Date(ctx.endDateMilliseconds),
      { inclusiveEnd: true },
    );
    Object.assign(params, pred.parameters);
    return `(${dateFilter}) AND (${pred.statement})`;
  });
  replaceAll(/\$__timeInterval_ms\(([^)]+)\)/g, (_m, col) => {
    const bucket = timeBucketExpr(col.trim(), format, gran);
    Object.assign(params, bucket.parameters);
    return bucket.statement;
  });
  replaceAll(/\$__timeInterval\(([^)]+)\)/g, (_m, col) => {
    const bucket = timeBucketExpr(col.trim(), format, gran);
    Object.assign(params, bucket.parameters);
    return bucket.statement;
  });
  const sourceTable = () =>
    ctx.sourceKeyspace?.trim() || '`otel`.`default`.`otel_logs`';
  replaceAll(/\$__sourceTable\([^)]*\)/g, sourceTable);
  replaceAll(/\$__sourceTable\b/g, sourceTable);

  // Remaining $__filter / $__conditionalAll: leave for chart variables layer;
  // when unused expand to TRUE.
  replaceAll(/\$__filters?\([^)]*\)/g, () => 'TRUE');
  replaceAll(/\$__conditionalAll\([^)]*\)/g, () => 'TRUE');

  void sqlpp;
  return { sql: out, params };
}

export function expandMacroCouchbase(name: string): never {
  throw new Error(`expandMacroCouchbase(${name}): use expandMacrosCouchbase`);
}
