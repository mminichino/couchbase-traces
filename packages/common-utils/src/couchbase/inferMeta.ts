import type { ColumnMeta } from './types';

export const DATETIME_TYPE = "DateTime64(9, 'UTC')";

// Anchored with bounded repetition only, so matching is linear.

const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const ISO_FRACTION_RE = /^\.\d{1,9}/;
const ISO_ZONE_RE = /^(?:Z|[+-]\d{2}:?\d{2})$/;

/** `YYYY-MM-DDTHH:MM:SS`, optional 1-9 digit fraction, then `Z` or an offset. */
export function isIsoDateTime(v: string): boolean {
  const head = ISO_DATETIME_RE.exec(v);
  if (head == null) return false;
  const rest = v.slice(head[0].length);
  const fraction = ISO_FRACTION_RE.exec(rest);
  return ISO_ZONE_RE.test(fraction ? rest.slice(fraction[0].length) : rest);
}
// 2^63; doubles cannot represent 2^63 - 1 exactly.
const INT64_LIMIT = 2 ** 63;

type Kind =
  | 'datetime'
  | 'string'
  | 'int'
  | 'float'
  | 'bool'
  | 'object'
  | 'array';

function kindOf(v: unknown): Kind {
  if (typeof v === 'string') {
    return isIsoDateTime(v) ? 'datetime' : 'string';
  }
  if (typeof v === 'number') {
    return Number.isInteger(v) && Math.abs(v) < INT64_LIMIT ? 'int' : 'float';
  }
  if (typeof v === 'bigint') return 'int';
  if (typeof v === 'boolean') return 'bool';
  if (Array.isArray(v)) return 'array';
  return 'object';
}

const UNWRAPPED = /^(Array|Map|JSON)(\(|$)/;

function wrapNullable(type: string): string {
  if (UNWRAPPED.test(type) || type.startsWith('Nullable(')) return type;
  return `Nullable(${type})`;
}

function unwrapNullable(type: string): { inner: string; nullable: boolean } {
  const m = /^Nullable\((.*)\)$/.exec(type);
  return m ? { inner: m[1], nullable: true } : { inner: type, nullable: false };
}

function arrayInnerType(elements: unknown[]): string {
  const nonNull = elements.filter(e => e != null);
  if (nonNull.length === 0) return 'String';
  const kinds = new Set(nonNull.map(kindOf));
  if (kinds.has('array')) return 'JSON';
  const inner = typeForNonNull(nonNull, kinds);
  return inner === 'String' && kinds.size > 1 && !onlyStrings(kinds)
    ? 'JSON'
    : inner;
}

function onlyStrings(kinds: Set<Kind>): boolean {
  return [...kinds].every(k => k === 'string' || k === 'datetime');
}

function typeForNonNull(values: unknown[], kinds: Set<Kind>): string {
  if (kinds.size === 1 && kinds.has('datetime')) return DATETIME_TYPE;
  if (onlyStrings(kinds)) return 'String';
  if ([...kinds].every(k => k === 'int' || k === 'float')) {
    return kinds.has('float') ? 'Float64' : 'Int64';
  }
  if (kinds.size === 1 && kinds.has('bool')) return 'Bool';
  if (kinds.size === 1 && kinds.has('object')) {
    const allStringValues = values.every(
      o =>
        typeof o === 'object' &&
        o !== null &&
        Object.values(o).every(x => typeof x === 'string'),
    );
    return allStringValues ? 'Map(String, String)' : 'JSON';
  }
  if (kinds.size === 1 && kinds.has('array')) {
    return `Array(${arrayInnerType(values.flatMap(v => (Array.isArray(v) ? v : [])))})`;
  }
  return 'String';
}

/** Type of one column's values, MISSING excluded; `null` values count. */
export function inferColumnType(values: unknown[]): string {
  const nonNull = values.filter(v => v != null);
  if (nonNull.length === 0) return 'Nullable(String)';
  const type = typeForNonNull(nonNull, new Set(nonNull.map(kindOf)));
  return nonNull.length < values.length ? wrapNullable(type) : type;
}

export function widenType(a: string, b: string): string {
  if (a === b) return a;
  const ua = unwrapNullable(a);
  const ub = unwrapNullable(b);
  let inner: string;
  if (ua.inner === ub.inner) {
    inner = ua.inner;
  } else if (
    (ua.inner === 'Int64' && ub.inner === 'Float64') ||
    (ua.inner === 'Float64' && ub.inner === 'Int64')
  ) {
    inner = 'Float64';
  } else {
    inner = 'String';
  }
  return ua.nullable || ub.nullable ? wrapNullable(inner) : inner;
}

export function inferMeta(
  rows: Record<string, unknown>[],
  hints?: { columns?: string[]; columnTypes?: Record<string, string> },
): ColumnMeta[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const c of hints?.columns ?? []) {
    if (!seen.has(c)) {
      seen.add(c);
      order.push(c);
    }
  }
  const values = new Map<string, unknown[]>();
  for (const row of rows) {
    for (const [k, v] of Object.entries(row)) {
      if (!seen.has(k)) {
        seen.add(k);
        order.push(k);
      }
      let list = values.get(k);
      if (!list) {
        list = [];
        values.set(k, list);
      }
      list.push(v);
    }
  }
  const hinted = new Map(Object.entries(hints?.columnTypes ?? {}));
  return order.map(name => ({
    name,
    type: hinted.get(name) ?? inferColumnType(values.get(name) ?? []),
  }));
}

/** Applies ClickHouse JSON output conventions to one value. */
export function encodeValue(type: string, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  const { inner } = unwrapNullable(type);
  if (inner === 'Int64') {
    if (typeof v === 'number' || typeof v === 'bigint') return String(v);
    return typeof v === 'string' ? v : JSON.stringify(v);
  }
  if (inner === 'String') {
    return typeof v === 'string' ? v : JSON.stringify(v);
  }
  return v;
}

export function encodeRow(
  meta: ColumnMeta[],
  row: Record<string, unknown>,
): Record<string, unknown> {
  const values = new Map(Object.entries(row));
  const out = new Map<string, unknown>();
  for (const { name, type } of meta) {
    out.set(name, encodeValue(type, values.get(name)));
  }
  // Keys not yet described by meta keep their raw value rather than vanish.
  for (const [k, v] of values) {
    if (!out.has(k)) out.set(k, v);
  }
  return Object.fromEntries(out);
}
