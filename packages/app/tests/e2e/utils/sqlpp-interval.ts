/**
 * Upstream specs assert ClickHouse's `INTERVAL <n> <unit>` in generated SQL.
 * SQL++ buckets by the interval's width in milliseconds
 * (`FLOOR(<millis> / <width>) * <width>`, `couchbase/time.ts`), so the same
 * assertion matches that width instead.
 */
const UNIT_MS = new Map<string, number>([
  ['second', 1_000],
  ['minute', 60_000],
  ['hour', 3_600_000],
  ['day', 86_400_000],
]);

export function sqlppBucketWidth(interval: string): string {
  const match = /^(\d+) (second|minute|hour|day)$/.exec(interval.trim());
  const unitMs = match ? UNIT_MS.get(match[2]) : undefined;
  if (!match || unitMs == null) {
    throw new Error(`Unsupported interval: ${interval}`);
  }
  const width = Number(match[1]) * unitMs;
  return `/ ${width}) * ${width}`;
}
