import { canonicalJson } from '../model/keys';
import type { AnyValue, KeyValue } from './types';

/** legacy store's zero DateTime / DateTime64, fixed-width ISO-8601. */
export const EPOCH_ISO = '1970-01-01T00:00:00.000000000Z';

const UINT64_MAX = 18446744073709551615n;

/**
 * `pcommon.Value.AsString` for a double, which the legacy store exporter stores.
 * ES6 number-to-string: fixed digits on `[1e-6, 1e21)`, exponent notation
 * outside that range, and a one-digit negative exponent (`1e-7`, not `1e-07`).
 */
export function formatFloatGo(v: number): string {
  if (Number.isNaN(v)) return 'NaN';
  if (v === Infinity) return 'Infinity';
  if (v === -Infinity) return '-Infinity';
  if (Object.is(v, -0)) return '-0';
  if (v === 0) return '0';

  const abs = Math.abs(v);
  if (abs < 1e-6 || abs >= 1e21) {
    return v.toExponential().replace(/e-0(\d)$/, 'e-$1');
  }

  const neg = v < 0;
  const sign = neg ? '-' : '';
  if (Number.isInteger(abs)) {
    const digits = abs.toLocaleString('en-US', {
      useGrouping: false,
      maximumFractionDigits: 0,
    });
    if (!/[eE]/.test(digits) && Number(digits) === abs) return sign + digits;
  }
  for (let places = 0; places <= 340; places++) {
    const fixed = abs.toFixed(places);
    if (/[eE]/.test(fixed)) break;
    if (Number(fixed) === abs) {
      const trimmed = fixed.includes('.')
        ? fixed.replace(/0+$/, '').replace(/\.$/, '')
        : fixed;
      return sign + trimmed;
    }
  }
  return sign + String(abs);
}

/** ASCII digits within uint64, otherwise 0. Matches legacy store `toUInt64OrZero`. */
export function parseUInt64OrZero(raw: string): number {
  if (!/^[0-9]+$/.test(raw)) return 0;
  let value: bigint;
  try {
    value = BigInt(raw);
  } catch {
    return 0;
  }
  if (value > UINT64_MAX) return 0;
  return Number(value);
}

export function int64ToNumber(s: string | number | undefined): number {
  if (typeof s === 'number') return Number.isFinite(s) ? s : 0;
  if (typeof s !== 'string' || s === '') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Fixed-width UTC timestamp. `null` for absent or zero so callers can apply
 * the legacy store default or the observed-time fallback.
 */
export function nanosToIso(
  nanos: string | number | undefined,
  precision: 'ns' | 's',
): string | null {
  if (nanos === undefined || nanos === '') return null;
  let value: bigint;
  try {
    value = BigInt(nanos);
  } catch {
    return null;
  }
  if (value <= 0n) return null;
  const sec = value / 1000000000n;
  const frac = value % 1000000000n;
  const date = new Date(Number(sec * 1000n));
  if (Number.isNaN(date.getTime())) return null;
  const base = date.toISOString().slice(0, 19);
  if (precision === 's') return `${base}.000000000Z`;
  return `${base}.${frac.toString().padStart(9, '0')}Z`;
}

export function dateToIso(date: Date, precision: 'ns' | 's'): string {
  const nanos = BigInt(date.getTime()) * 1000000n;
  return nanosToIso(nanos.toString(), precision) ?? EPOCH_ISO;
}

export function isoToEpochMs(iso: string): number {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Truncate a 30-character timestamp to a whole second, keeping the width. */
export function truncateToSeconds(iso: string): string {
  return `${iso.slice(0, 19)}.000000000Z`;
}

function hasKind(v: AnyValue): boolean {
  return (
    v.stringValue !== undefined ||
    v.intValue !== undefined ||
    v.doubleValue !== undefined ||
    v.boolValue !== undefined ||
    v.bytesValue !== undefined ||
    v.arrayValue !== undefined ||
    v.kvlistValue !== undefined
  );
}

/** `pcommon.Value.AsRaw` for the JSON embedded in map and array attribute strings. */
export function anyValueToRaw(v: AnyValue | undefined): unknown {
  if (v == null || !hasKind(v)) return '';
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.intValue !== undefined) return int64ToNumber(v.intValue);
  if (v.doubleValue !== undefined) {
    return typeof v.doubleValue === 'number' && Number.isFinite(v.doubleValue)
      ? v.doubleValue
      : null;
  }
  if (v.boolValue !== undefined) return v.boolValue;
  if (v.bytesValue !== undefined) return v.bytesValue;
  if (v.arrayValue !== undefined) {
    return (v.arrayValue.values ?? []).map(item => anyValueToRaw(item));
  }
  const out: Record<string, unknown> = {};
  for (const kv of v.kvlistValue?.values ?? []) {
    if (kv.key !== undefined) out[kv.key] = anyValueToRaw(kv.value);
  }
  return out;
}

/** `pcommon.Value.AsString`. */
export function anyValueToString(v: AnyValue | undefined): string {
  if (v == null || !hasKind(v)) return '';
  if (v.stringValue !== undefined) return v.stringValue;
  if (v.intValue !== undefined) {
    if (typeof v.intValue === 'number') {
      return Number.isFinite(v.intValue) ? String(v.intValue) : '0';
    }
    return v.intValue;
  }
  if (v.doubleValue !== undefined) {
    return typeof v.doubleValue === 'number'
      ? formatFloatGo(v.doubleValue)
      : '';
  }
  if (v.boolValue !== undefined) return v.boolValue ? 'true' : 'false';
  if (v.bytesValue !== undefined) return v.bytesValue;
  return canonicalJson(anyValueToRaw(v));
}

/** Later duplicate keys win, matching map insertion in the collector. */
export function attributesToMap(
  kvs: KeyValue[] | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const kv of kvs ?? []) {
    if (kv.key === undefined) continue;
    out[kv.key] = anyValueToString(kv.value);
  }
  return out;
}

/** Lower-case hex. Absent and all-zero ids are empty, as `TraceIDToHexOrEmptyString`. */
export function hexId(id: string | undefined): string {
  if (id == null || id === '') return '';
  const lower = id.toLowerCase();
  if (/^0+$/.test(lower)) return '';
  return lower;
}
