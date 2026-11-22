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

/**
 * Write order within one createdAt (D12): the seq stamped at write time, then
 * the key for rows written before seq existed (MISSING sorts first, so old
 * rows precede new ones in a window that mixes both).
 */
const WRITE_ORDER = sqlpp`h.seq, META(h).id`;
const WRITE_ORDER_DESC = sqlpp`h.seq DESC, META(h).id DESC`;

/**
 * ARRAY_AGG has no ORDER BY in SQL++ 8.0 and its output order is unspecified.
 * Aggregating `{"o": [seq, key], "v": value}` and sorting with ARRAY_SORT
 * orders the array by write order: every element is a two-member object with
 * the same keys, so collation compares `o` first ("o" < "v"), and [seq, key]
 * compares element-wise (a MISSING seq becomes null inside the array, which
 * sorts before any number). `.v` then strips the sort key again.
 */
function inWriteOrder(value: SqlPP): SqlPP {
  return sqlpp`ARRAY e.v FOR e IN ARRAY_SORT(ARRAY_AGG({"o": [h.seq, META(h).id], "v": ${value}})) END`;
}

/** getPreviousAlertHistories: the newest non-ERROR row per group. */
export function buildLatestPerGroup(t: Target, alert: Id, r: DateRange): SqlPP {
  // The partition expression is the one ix_alert_history_group indexes.
  return sqlpp`SELECT x.createdAt, x.state, x.fired, x.groupValues, x.${{ Identifier: 'group' }} FROM (SELECT h.createdAt, h.state, h.fired, h.groupValues, ${GROUP}, ROW_NUMBER() OVER (PARTITION BY IFMISSINGORNULL(${GROUP}, ${{ Param: '' }}) ORDER BY h.createdAt DESC, ${WRITE_ORDER_DESC}) AS rn FROM ${source(t)} WHERE ${where(alert, r, 'none')}) AS x WHERE x.rn = ${{ Param: 1 }}`;
}

/** getConsecutiveWindowHistories: every non-ERROR row in range. */
export function buildRangeExcludingErrors(
  t: Target,
  alert: Id,
  r: DateRange,
): SqlPP {
  return sqlpp`SELECT h.createdAt, h.state, h.fired, h.groupValues, ${GROUP} FROM ${source(t)} WHERE ${where(alert, r, 'none')} ORDER BY ${GROUP}, h.createdAt DESC, ${WRITE_ORDER_DESC}`;
}

/** One entry per createdAt, ERROR rows included, newest first. */
export function buildGroupedByWindow(
  t: Target,
  alert: Id,
  r: DateRange,
  limit: number,
): SqlPP {
  // `errors` keeps ARRAY_AGG's MISSING-skipping: only rows that have errors
  // contribute an entry, which is what the window's error list counts.
  return sqlpp`SELECT h.createdAt, ${inWriteOrder(sqlpp`h.state`)} AS states, SUM(h.counts) AS counts, ${inWriteOrder(sqlpp`h.lastValues`)} AS lastValues, ARRAY e.v FOR e IN ARRAY_SORT(ARRAY_AGG(CASE WHEN h.errors IS NOT MISSING THEN {"o": [h.seq, META(h).id], "v": h.errors} ELSE MISSING END)) END AS errors FROM ${source(t)} WHERE ${where(alert, r, 'any')} GROUP BY h.createdAt ORDER BY h.createdAt DESC LIMIT ${{ Param: limit }}`;
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
  const row = sqlpp`{"group": ${GROUP}, "state": h.state, "counts": h.counts, "lastValues": h.lastValues, "fired": h.fired, "errors": h.errors, "analytics": h.analytics}`;
  return sqlpp`SELECT h.createdAt, ${inWriteOrder(row)} AS \`rows\` FROM ${source(t)} WHERE ${where(alert, r, 'any')} GROUP BY h.createdAt ORDER BY h.createdAt DESC LIMIT ${{ Param: limit }}`;
}

/** Per-window states and bucket starts, oldest first, ERROR rows excluded. */
export function buildTransitionWindows(
  t: Target,
  alert: Id,
  r: DateRange,
): SqlPP {
  const starts = sqlpp`ARRAY lv.startTime FOR lv IN IFMISSINGORNULL(h.lastValues, []) END`;
  return sqlpp`SELECT h.createdAt, ${inWriteOrder(sqlpp`h.state`)} AS states, ${inWriteOrder(starts)} AS bucketStarts FROM ${source(t)} WHERE ${where(alert, r, 'none')} GROUP BY h.createdAt ORDER BY h.createdAt ASC`;
}

/** Every row of the alert in range, oldest first, with its document key. */
export function buildHistoryRows(t: Target, alert: Id, r: DateRange): SqlPP {
  return sqlpp`SELECT META(h).id AS k, h AS v FROM ${source(t)} WHERE ${where(alert, r, 'any')} ORDER BY h.createdAt ASC, ${WRITE_ORDER}`;
}

export function buildErrorRowKeys(t: Target, alert: Id, r: DateRange): SqlPP {
  return sqlpp`SELECT RAW META(h).id FROM ${source(t)} WHERE ${where(alert, r, 'only')}`;
}
