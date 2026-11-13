const UNITS: Record<string, number> = {
  ns: 1e-6,
  us: 1e-3,
  µs: 1e-3,
  μs: 1e-3,
  ms: 1,
  s: 1000,
  m: 60_000,
  h: 3_600_000,
};

const DURATION_RE = /(\d+\.\d+|\d+)(ns|us|µs|μs|ms|s|m|h)/g;
const DAYS_RE = /^(\d+)d$/;

/**
 * Go duration (`720h`, `90m`, `1h30m`) or a whole number of days (`30d`).
 * Returns milliseconds. Throws naming `variable` when the text is not valid.
 */
export function parseTtl(raw: string, variable: string): number {
  const text = raw.trim();
  const days = DAYS_RE.exec(text);
  if (days) return Number(days[1]) * 86_400_000;
  if (text === '' || /[dD]/.test(text)) {
    throw new Error(`${variable} is not a valid duration: ${raw}`);
  }
  DURATION_RE.lastIndex = 0;
  let matched = '';
  let ms = 0;
  let part: RegExpExecArray | null;
  while ((part = DURATION_RE.exec(text))) {
    matched += part[0];
    ms += Number(part[1]) * UNITS[part[2]];
  }
  if (matched !== text || ms <= 0 || !Number.isFinite(ms)) {
    throw new Error(`${variable} is not a valid duration: ${raw}`);
  }
  return ms;
}

export function ttlSeconds(ms: number): number {
  return Math.floor(ms / 1000);
}

export type TtlEnvName =
  | 'CBT_LOGS_TTL'
  | 'CBT_TRACES_TTL'
  | 'CBT_METRICS_TTL'
  | 'CBT_SESSIONS_TTL';

/** Specific variable, then `CBT_OTEL_EXPORTER_TABLES_TTL`, then `720h`. */
export function resolveTtlMs(env: NodeJS.ProcessEnv, name: TtlEnvName): number {
  const specific = env[name];
  if (specific != null && specific !== '') return parseTtl(specific, name);
  const fallback = env.CBT_OTEL_EXPORTER_TABLES_TTL;
  if (fallback != null && fallback !== '') {
    return parseTtl(fallback, 'CBT_OTEL_EXPORTER_TABLES_TTL');
  }
  return parseTtl('720h', name);
}
