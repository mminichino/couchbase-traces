import type { MemoryKv } from '@/metadata/testing/memoryKv';
import {
  FIND_LIMIT_MAX,
  type FindSpec,
  type Found,
  KEY_FIELD,
  type MetaCollection,
  type MetaFind,
} from '@/metadata/types';

// SQL++ collation: MISSING < NULL < FALSE < TRUE < numbers < strings.
function rank(v: unknown): number {
  if (v === undefined) return 0;
  if (v === null) return 1;
  if (typeof v === 'boolean') return 2;
  if (typeof v === 'number') return 3;
  if (typeof v === 'string') return 4;
  return 5;
}

export function compare(a: unknown, b: unknown): number {
  const r = rank(a) - rank(b);
  if (r !== 0) return r;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' && typeof b === 'boolean') {
    return Number(a) - Number(b);
  }
  if (typeof a === 'string' && typeof b === 'string') {
    if (a === b) return 0;
    // Raw byte order like SQL++, not locale order.
    return Buffer.compare(Buffer.from(a), Buffer.from(b));
  }
  return 0;
}

export function field(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return new Map(Object.entries(value)).get(name);
}

type Filter = Omit<FindSpec, 'orderBy' | 'offset' | 'limit'>;

function matches(value: unknown, spec: Filter): boolean {
  const { contains, hasAll } = spec;
  return (
    Object.entries(spec.where ?? {}).every(([f, v]) => field(value, f) === v) &&
    (spec.present ?? []).every(f => field(value, f) !== undefined) &&
    (spec.notTrue ?? []).every(f => field(value, f) !== true) &&
    (!contains ||
      String(field(value, contains.field) ?? '')
        .toLowerCase()
        .includes(contains.value.toLowerCase())) &&
    (!hasAll ||
      hasAll.values.every(v => {
        const arr = field(value, hasAll.field);
        return Array.isArray(arr) && arr.includes(v);
      }))
  );
}

/** MetaFind as a scan over MemoryKv with SQL++ ordering semantics. */
export class MemoryFind implements MetaFind {
  constructor(private readonly kv: MemoryKv) {}

  async find<T>(c: MetaCollection, spec: FindSpec): Promise<Found<T>[]> {
    const rows = this.kv
      .entries<T>(c)
      .filter(r => matches(r.value, spec))
      .sort((a, b) => {
        for (const o of spec.orderBy ?? []) {
          const d =
            o.field === KEY_FIELD
              ? compare(a.key, b.key)
              : compare(field(a.value, o.field), field(b.value, o.field));
          if (d !== 0) return o.dir === 'asc' ? d : -d;
        }
        return 0;
      });
    const start = spec.offset ?? 0;
    return rows.slice(
      start,
      start + Math.min(spec.limit ?? FIND_LIMIT_MAX, FIND_LIMIT_MAX),
    );
  }

  async count(c: MetaCollection, spec: Filter): Promise<number> {
    return this.kv.entries(c).filter(r => matches(r.value, spec)).length;
  }

  async distinct(
    c: MetaCollection,
    fieldName: string,
    spec: Filter,
  ): Promise<string[]> {
    const seen = new Set<string>();
    for (const r of this.kv.entries(c)) {
      if (!matches(r.value, spec)) continue;
      const arr = field(r.value, fieldName);
      if (!Array.isArray(arr)) continue;
      for (const v of arr) if (typeof v === 'string') seen.add(v);
    }
    return [...seen];
  }
}
