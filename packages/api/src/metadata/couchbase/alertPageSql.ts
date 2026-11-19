import {
  concatSqlPP,
  type SqlPP,
  sqlpp,
} from '@couchbase-traces/common-utils/dist/couchbase/sqlpp';

import type { MetadataConfig } from '@/metadata/couchbase/config';
import { metaCollection } from '@/metadata/couchbase/keyspace';
import type { AlertsPageQuery } from '@/metadata/types';

type Target = Pick<MetadataConfig, 'bucket' | 'scope'>;

/** Schema defaults a missing field stands for (see Alert `state`/`source`). */
export const DEFAULT_ALERT_STATE = 'OK';
export const DEFAULT_ALERT_SOURCE = 'saved_search';

// Same expression as ix_alerts_page, so the index serves the sort. MISSING
// and NULL collapse to one block, which the cursor logic relies on.
const NAME = sqlpp`IFMISSINGORNULL(d.displayName, NULL)`;

function cursorCond(after: NonNullable<AlertsPageQuery['after']>): SqlPP {
  // Inside the null block the next row is another null name with a higher
  // id, or any named alert; past it, a higher name, or the same with a
  // higher id.
  if (after.name === null) {
    return sqlpp`((${NAME} IS NULL AND META(d).id > ${{ Param: after.id }}) OR ISSTRING(d.displayName))`;
  }
  return sqlpp`(d.displayName > ${{ Param: after.name }} OR (d.displayName = ${{ Param: after.name }} AND META(d).id > ${{ Param: after.id }}))`;
}

function conds(q: Omit<AlertsPageQuery, 'limit'>): SqlPP {
  const c: SqlPP[] = [sqlpp`d.team = ${{ Param: q.team }}`];
  if (q.tags) {
    c.push(sqlpp`ANY t IN d.tags SATISFIES t IN ${{ Param: q.tags }} END`);
  }
  if (q.states) {
    c.push(
      sqlpp`IFMISSINGORNULL(d.state, ${{ Param: DEFAULT_ALERT_STATE }}) IN ${{ Param: q.states }}`,
    );
  }
  if (q.sources) {
    c.push(
      sqlpp`IFMISSINGORNULL(d.source, ${{ Param: DEFAULT_ALERT_SOURCE }}) IN ${{ Param: q.sources }}`,
    );
  }
  if (q.search) {
    c.push(
      sqlpp`CONTAINS(LOWER(d.displayName), LOWER(${{ Param: q.search }}))`,
    );
  }
  if (q.createdBy) {
    c.push(sqlpp`d.createdBy = ${{ Param: q.createdBy }}`);
  }
  if (q.after) c.push(cursorCond(q.after));
  return concatSqlPP(' AND ', c);
}

export function buildAlertsPage(t: Target, q: AlertsPageQuery): SqlPP {
  const ks = { Keyspace: metaCollection(t, 'alerts') };
  const limit = q.limit == null ? sqlpp`` : sqlpp` LIMIT ${{ Param: q.limit }}`;
  return sqlpp`SELECT META(d).id AS k, d AS v FROM ${ks} AS d WHERE ${conds(q)} ORDER BY ${NAME}, META(d).id${limit}`;
}

export function buildAlertsCount(
  t: Target,
  q: Omit<AlertsPageQuery, 'after' | 'limit'>,
): SqlPP {
  const ks = { Keyspace: metaCollection(t, 'alerts') };
  return sqlpp`SELECT RAW COUNT(*) FROM ${ks} AS d WHERE ${conds(q)}`;
}
