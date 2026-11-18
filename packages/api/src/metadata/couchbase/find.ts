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
  type MetaCollection,
  type MetaFind,
} from '@/metadata/types';

type Target = Pick<MetadataConfig, 'bucket' | 'scope'>;

const DIRECTION = { asc: 'ASC', desc: 'DESC' } as const;

function predicate(spec: Omit<FindSpec, 'orderBy'>): SqlPP {
  const conds: SqlPP[] = [
    ...Object.entries(spec.where ?? {}).map(
      ([field, value]) =>
        sqlpp`d.${{ Identifier: field }} = ${{ Param: value }}`,
    ),
    ...(spec.present ?? []).map(
      field => sqlpp`d.${{ Identifier: field }} IS NOT MISSING`,
    ),
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
  const order = (spec.orderBy ?? []).map(
    o => sqlpp`d.${{ Identifier: o.field }} ${{ Raw: DIRECTION[o.dir] }}`,
  );
  const orderBy =
    order.length > 0 ? sqlpp` ORDER BY ${concatSqlPP(', ', order)}` : sqlpp``;
  return sqlpp`SELECT META(d).id AS k, d AS v FROM ${ks} AS d WHERE ${predicate(spec)}${orderBy} LIMIT ${{ Param: limitOf(spec) }}`;
}

export function buildCount(
  t: Target,
  c: MetaCollection,
  spec: Omit<FindSpec, 'orderBy'>,
): SqlPP {
  const ks = { Keyspace: metaCollection(t, c) };
  return sqlpp`SELECT RAW COUNT(*) FROM ${ks} AS d WHERE ${predicate(spec)}`;
}

/** MetaFind over SQL++ with request_plus, so a write is visible to the next read. */
export class CouchbaseFind implements MetaFind {
  constructor(
    private readonly cluster: QueryPort,
    private readonly cfg: Target & Pick<MetadataConfig, 'password'>,
  ) {}

  async find<T>(c: MetaCollection, spec: FindSpec): Promise<Found<T>[]> {
    const rows = await runQuery<{ k: string; v: T }>(
      this.cluster,
      buildFind(this.cfg, c, spec),
      undefined,
      { secrets: [this.cfg.password] },
    );
    return rows.map(r => ({ key: r.k, value: r.v }));
  }

  async count(
    c: MetaCollection,
    spec: Omit<FindSpec, 'orderBy'>,
  ): Promise<number> {
    const [n] = await runQuery<number>(
      this.cluster,
      buildCount(this.cfg, c, spec),
      undefined,
      { secrets: [this.cfg.password] },
    );
    return n ?? 0;
  }
}
