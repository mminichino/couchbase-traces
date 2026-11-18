import type { MemoryKv } from '@/metadata/testing/memoryKv';
import {
  FIND_LIMIT_MAX,
  type FindSpec,
  type Found,
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

function compare(a: unknown, b: unknown): number {
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

function field(value: unknown, name: string): unknown {
  if (typeof value !== 'object' || value === null) return undefined;
  return new Map(Object.entries(value)).get(name);
}

function matches(value: unknown, spec: Omit<FindSpec, 'orderBy'>): boolean {
  return (
    Object.entries(spec.where ?? {}).every(([f, v]) => field(value, f) === v) &&
    (spec.present ?? []).every(f => field(value, f) !== undefined)
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
          const d = compare(field(a.value, o.field), field(b.value, o.field));
          if (d !== 0) return o.dir === 'asc' ? d : -d;
        }
        return 0;
      });
    return rows.slice(
      0,
      Math.min(spec.limit ?? FIND_LIMIT_MAX, FIND_LIMIT_MAX),
    );
  }

  async count(
    c: MetaCollection,
    spec: Omit<FindSpec, 'orderBy'>,
  ): Promise<number> {
    return this.kv.entries(c).filter(r => matches(r.value, spec)).length;
  }
}
