import {
  concatSqlPP,
  type SqlPP,
  sqlpp,
} from '@couchbase-traces/common-utils/dist/couchbase/sqlpp';

import type { MetadataConfig } from '@/metadata/couchbase/config';
import { metaCollection } from '@/metadata/couchbase/keyspace';
import { type QueryPort, runQuery } from '@/metadata/couchbase/query';
import { MetadataError } from '@/metadata/errors';
import {
  FIND_LIMIT_MAX,
  type FindSpec,
  type Found,
  KEY_FIELD,
  type MetaCollection,
  type MetaFind,
} from '@/metadata/types';

type Target = Pick<MetadataConfig, 'bucket' | 'scope'>;

/** What a repository query may ask for beyond its filter. */
type QueryBound = { timeoutMs?: number };

const DIRECTION = { asc: 'ASC', desc: 'DESC' } as const;

type Filter = Omit<FindSpec, 'orderBy' | 'offset' | 'limit'>;

function hasAllConds(h: FindSpec['hasAll']): SqlPP[] {
  if (!h) return [];
  return h.values.map(
    value =>
      sqlpp`ARRAY_CONTAINS(d.${{ Identifier: h.field }}, ${{ Param: value }})`,
  );
}

function predicate(spec: Filter): SqlPP {
  const conds: SqlPP[] = [
    ...Object.entries(spec.where ?? {}).map(
      ([field, value]) =>
        sqlpp`d.${{ Identifier: field }} = ${{ Param: value }}`,
    ),
    ...(spec.present ?? []).map(
      field => sqlpp`d.${{ Identifier: field }} IS NOT MISSING`,
    ),
    ...(spec.notTrue ?? []).map(
      field =>
        sqlpp`IFMISSINGORNULL(d.${{ Identifier: field }}, FALSE) != TRUE`,
    ),
    ...(spec.contains
      ? [
          sqlpp`CONTAINS(LOWER(d.${{ Identifier: spec.contains.field }}), LOWER(${{ Param: spec.contains.value }}))`,
        ]
      : []),
    ...hasAllConds(spec.hasAll),
  ];
  // A bare scan needs a primary index, which the metadata keyspace never has.
  if (conds.length === 0) {
    throw new MetadataError('find needs a where or present field');
  }
  return concatSqlPP(' AND ', conds);
}

function limitOf(spec: Pick<FindSpec, 'limit'>): number {
  return Math.min(spec.limit ?? FIND_LIMIT_MAX, FIND_LIMIT_MAX);
}

/** The SELECT for one FindSpec; exported for statement-shape unit tests. */
export function buildFind(t: Target, c: MetaCollection, spec: FindSpec): SqlPP {
  const ks = { Keyspace: metaCollection(t, c) };
  const order = (spec.orderBy ?? []).map(o =>
    o.field === KEY_FIELD
      ? sqlpp`META(d).id ${{ Raw: DIRECTION[o.dir] }}`
      : sqlpp`d.${{ Identifier: o.field }} ${{ Raw: DIRECTION[o.dir] }}`,
  );
  const orderBy =
    order.length > 0 ? sqlpp` ORDER BY ${concatSqlPP(', ', order)}` : sqlpp``;
  const offset = spec.offset
    ? sqlpp` OFFSET ${{ Param: spec.offset }}`
    : sqlpp``;
  return sqlpp`SELECT META(d).id AS k, d AS v FROM ${ks} AS d WHERE ${predicate(spec)}${orderBy} LIMIT ${{ Param: limitOf(spec) }}${offset}`;
}

export function buildDistinct(
  t: Target,
  c: MetaCollection,
  field: string,
  spec: Filter,
): SqlPP {
  const ks = { Keyspace: metaCollection(t, c) };
  return sqlpp`SELECT DISTINCT RAW v FROM ${ks} AS d UNNEST d.${{ Identifier: field }} AS v WHERE ${predicate(spec)}`;
}

export function buildCount(t: Target, c: MetaCollection, spec: Filter): SqlPP {
  const ks = { Keyspace: metaCollection(t, c) };
  return sqlpp`SELECT RAW COUNT(*) FROM ${ks} AS d WHERE ${predicate(spec)}`;
}

/** MetaFind over SQL++ with request_plus, so a write is visible to the next read. */
export class CouchbaseFind implements MetaFind {
  constructor(
    private readonly cluster: QueryPort,
    private readonly cfg: Target &
      Pick<MetadataConfig, 'password' | 'queryTimeoutMs'>,
  ) {}

  /** The explicit per-query bound: the spec's own, else the configured default. */
  private bound(spec: QueryBound) {
    return {
      timeoutMs: spec.timeoutMs ?? this.cfg.queryTimeoutMs,
      secrets: [this.cfg.password],
    };
  }

  async find<T>(c: MetaCollection, spec: FindSpec): Promise<Found<T>[]> {
    const rows = await runQuery<{ k: string; v: T }>(
      this.cluster,
      buildFind(this.cfg, c, spec),
      undefined,
      this.bound(spec),
    );
    return rows.map(r => ({ key: r.k, value: r.v }));
  }

  async count(c: MetaCollection, spec: Filter): Promise<number> {
    const [n] = await runQuery<number>(
      this.cluster,
      buildCount(this.cfg, c, spec),
      undefined,
      this.bound(spec),
    );
    return n ?? 0;
  }

  async distinct(
    c: MetaCollection,
    field: string,
    spec: Filter,
  ): Promise<string[]> {
    return runQuery<string>(
      this.cluster,
      buildDistinct(this.cfg, c, field, spec),
      undefined,
      this.bound(spec),
    );
  }
}
