import {
  concatSqlPP,
  type SqlPP,
  sqlpp,
} from '@couchbase-traces/common-utils/dist/couchbase/sqlpp';

import type { MetadataConfig } from '@/metadata/couchbase/config';
import { metaCollection } from '@/metadata/couchbase/keyspace';
import type { Id } from '@/metadata/ids';
import type { DateRange } from '@/metadata/schemas/alertHistory';

type Target = Pick<MetadataConfig, 'bucket' | 'scope'>;

/** `alert_history` rows are written with this state for failed windows. */
const ERROR = 'ERROR';

function source(t: Target): SqlPP {
  return sqlpp`${{ Keyspace: metaCollection(t, 'alert_history') }} AS h`;
}

/** createdAt is an ISO string, so string comparison is time comparison. */
function where(alert: Id, r: DateRange, errors: 'any' | 'only' | 'none') {
  const c: SqlPP[] = [sqlpp`h.alert = ${{ Param: alert }}`];
  if (r.gte) c.push(sqlpp`h.createdAt >= ${{ Param: r.gte.toISOString() }}`);
  if (r.gt) c.push(sqlpp`h.createdAt > ${{ Param: r.gt.toISOString() }}`);
  if (r.lte) c.push(sqlpp`h.createdAt <= ${{ Param: r.lte.toISOString() }}`);
  if (r.lt) c.push(sqlpp`h.createdAt < ${{ Param: r.lt.toISOString() }}`);
  if (errors === 'only') c.push(sqlpp`h.state = ${{ Param: ERROR }}`);
  if (errors === 'none') c.push(sqlpp`h.state != ${{ Param: ERROR }}`);
  return concatSqlPP(' AND ', c);
}

const GROUP = sqlpp`h.${{ Identifier: 'group' }}`;

/** getPreviousAlertHistories: the newest non-ERROR row per group. */
export function buildLatestPerGroup(t: Target, alert: Id, r: DateRange): SqlPP {
  // The partition expression is the one ix_alert_history_group indexes.
  return sqlpp`SELECT x.createdAt, x.state, x.fired, x.groupValues, x.${{ Identifier: 'group' }} FROM (SELECT h.createdAt, h.state, h.fired, h.groupValues, ${GROUP}, ROW_NUMBER() OVER (PARTITION BY IFMISSINGORNULL(${GROUP}, ${{ Param: '' }}) ORDER BY h.createdAt DESC, META(h).id DESC) AS rn FROM ${source(t)} WHERE ${where(alert, r, 'none')}) AS x WHERE x.rn = ${{ Param: 1 }}`;
}

/** getConsecutiveWindowHistories: every non-ERROR row in range. */
export function buildRangeExcludingErrors(
  t: Target,
  alert: Id,
  r: DateRange,
): SqlPP {
  return sqlpp`SELECT h.createdAt, h.state, h.fired, h.groupValues, ${GROUP} FROM ${source(t)} WHERE ${where(alert, r, 'none')} ORDER BY ${GROUP}, h.createdAt DESC`;
}

/** One entry per createdAt, ERROR rows included, newest first. */
export function buildGroupedByWindow(
  t: Target,
  alert: Id,
  r: DateRange,
  limit: number,
): SqlPP {
  return sqlpp`SELECT h.createdAt, ARRAY_AGG(h.state) AS states, SUM(h.counts) AS counts, ARRAY_AGG(h.lastValues) AS lastValues, ARRAY_AGG(h.errors) AS errors FROM ${source(t)} WHERE ${where(alert, r, 'any')} GROUP BY h.createdAt ORDER BY h.createdAt DESC LIMIT ${{ Param: limit }}`;
}

/** As above, keeping each row with its group identity and analytics. */
export function buildStructuredWindows(
  t: Target,
  alert: Id,
  r: DateRange,
  limit: number,
): SqlPP {
  // MISSING members are dropped from an object constructor, so absent
  // optional fields stay absent instead of becoming null.
  return sqlpp`SELECT h.createdAt, ARRAY_AGG({"group": ${GROUP}, "state": h.state, "counts": h.counts, "lastValues": h.lastValues, "fired": h.fired, "errors": h.errors, "analytics": h.analytics}) AS \`rows\` FROM ${source(t)} WHERE ${where(alert, r, 'any')} GROUP BY h.createdAt ORDER BY h.createdAt DESC LIMIT ${{ Param: limit }}`;
}

/** Per-window states and bucket starts, oldest first, ERROR rows excluded. */
export function buildTransitionWindows(
  t: Target,
  alert: Id,
  r: DateRange,
): SqlPP {
  return sqlpp`SELECT h.createdAt, ARRAY_AGG(h.state) AS states, ARRAY_AGG(ARRAY lv.startTime FOR lv IN IFMISSINGORNULL(h.lastValues, []) END) AS bucketStarts FROM ${source(t)} WHERE ${where(alert, r, 'none')} GROUP BY h.createdAt ORDER BY h.createdAt ASC`;
}

/** Every row of the alert in range, oldest first, with its document key. */
export function buildHistoryRows(t: Target, alert: Id, r: DateRange): SqlPP {
  return sqlpp`SELECT META(h).id AS k, h AS v FROM ${source(t)} WHERE ${where(alert, r, 'any')} ORDER BY h.createdAt ASC, META(h).id ASC`;
}

export function buildErrorRowKeys(t: Target, alert: Id, r: DateRange): SqlPP {
  return sqlpp`SELECT RAW META(h).id FROM ${source(t)} WHERE ${where(alert, r, 'only')}`;
}
