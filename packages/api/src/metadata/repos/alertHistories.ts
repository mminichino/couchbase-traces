import { DuplicateKeyError } from '@/metadata/errors';
import { type Id, newId } from '@/metadata/ids';
import { mutateDoc, type RepoDeps } from '@/metadata/repos/docs';
import { AlertState, type IAlertError } from '@/metadata/schemas/alert';
import {
  type AggregatedAlertHistory,
  ALERT_HISTORY_TTL_MS,
  type AlertHistoryDoc,
  AlertHistoryDocSchema,
  type DateRange,
  type GroupedAlertHistory,
  type IAlertHistory,
  type IAlertHistoryAnalytics,
  type StructuredWindow,
  type TransitionWindow,
} from '@/metadata/schemas/alertHistory';
import { iso } from '@/metadata/schemas/common';

/** Deterministic key: one ERROR row per (alert, evaluation window). */
export const errorRowKey = (alert: Id, windowStart: Date) =>
  `err::${alert}::${windowStart.getTime()}`;

const MIN_RETENTION_MS = 24 * 60 * 60 * 1000;

let lastSeq = 0;

/**
 * Reserves `n` consecutive write-order numbers (D12). Microseconds of the
 * repository clock, bumped past the last reservation, so they increase
 * strictly within a process even when the clock steps back, and across
 * processes follow wall time. Document keys cannot stand in: an id's
 * counter follows its seconds prefix and per-process random bytes, so it
 * is not write order across processes, after a clock step, or at a wrap.
 */
function reserveSeq(n: number, now: Date): number {
  const first = Math.max(lastSeq + 1, now.getTime() * 1000);
  lastSeq = first + n - 1;
  return first;
}

/**
 * Rows expire 30 days after `createdAt`, as the Mongo TTL index did. A row
 * for a window older than the retention (a long backfill, a replayed clock)
 * would otherwise get an expiry in the past, which Couchbase treats as
 * already expired, so such rows are kept for a day instead of vanishing.
 */
const expiryOf = (createdAt: Date, now: Date) =>
  new Date(
    Math.max(
      createdAt.getTime() + ALERT_HISTORY_TTL_MS,
      now.getTime() + MIN_RETENTION_MS,
    ),
  );

function toDoc(h: IAlertHistory, seq: number): AlertHistoryDoc {
  return AlertHistoryDocSchema.parse({
    ...h,
    seq,
    createdAt: iso(h.createdAt),
    lastValues: h.lastValues.map(v => ({
      ...v,
      startTime: iso(v.startTime),
    })),
    ...(h.errors && {
      errors: h.errors.map(e => ({ ...e, timestamp: iso(e.timestamp) })),
    }),
  });
}

/**
 * `alert_history/<id>` and `alert_history/err::<alertId>::<windowMs>`. The
 * grouping and window reads are SQL++ (MetaAlertQueries); everything here is
 * a keyed write, so document expiry is set once and kept on update.
 */
export class AlertHistoryRepository {
  private readonly now: () => Date;

  constructor(private readonly deps: RepoDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private get kv() {
    return this.deps.kv;
  }

  /**
   * Writes each row independently, so one failure does not lose the others.
   * Results line up with `rows`, and rows read back in this order.
   */
  createMany(rows: IAlertHistory[]): Promise<PromiseSettledResult<void>[]> {
    const first = reserveSeq(rows.length, this.now());
    return Promise.allSettled(
      rows.map(async (row, i) => {
        await this.kv.insert(
          'alert_history',
          newId(this.now()),
          toDoc(row, first + i),
          { expiry: expiryOf(row.createdAt, this.now()) },
        );
      }),
    );
  }

  /**
   * The ERROR row for one window: created on the first failure, updated by
   * retries. Updates keep the expiry set at creation (a replace without
   * `preserveExpiry` would clear it and the row would never age out).
   */
  async upsertErrorRow(
    alert: Id,
    windowStart: Date,
    errors: IAlertError[],
    analytics?: IAlertHistoryAnalytics,
  ): Promise<void> {
    const key = errorRowKey(alert, windowStart);
    const patch = (cur: AlertHistoryDoc): AlertHistoryDoc => ({
      ...cur,
      errors: errors.map(e => ({ ...e, timestamp: iso(e.timestamp) })),
      ...(analytics != null && { analytics }),
    });
    // An update keeps the row's first-write seq (patch spreads `cur`).
    const created = toDoc(
      {
        alert,
        counts: 0,
        createdAt: windowStart,
        state: AlertState.ERROR,
        lastValues: [],
        errors,
        ...(analytics != null && { analytics }),
      },
      reserveSeq(1, this.now()),
    );
    for (let attempt = 0; attempt < 3; attempt++) {
      const updated = await mutateDoc(
        this.kv,
        AlertHistoryDocSchema,
        'alert_history',
        key,
        patch,
        { preserveExpiry: true },
      );
      if (updated) return;
      try {
        await this.kv.insert('alert_history', key, created, {
          expiry: expiryOf(windowStart, this.now()),
        });
        return;
      } catch (err) {
        // A concurrent first writer won; update its row on the next pass.
        if (!(err instanceof DuplicateKeyError)) throw err;
      }
    }
    throw new DuplicateKeyError('alert_history_error_row');
  }

  /**
   * Removes the alert's ERROR rows in `range`, or at exactly one instant.
   * Used once a query succeeds over windows that earlier ticks failed.
   */
  async deleteErrorRows(alert: Id, range: DateRange | Date): Promise<number> {
    const r = range instanceof Date ? { gte: range, lte: range } : range;
    const keys = await this.deps.queries.errorRowKeys(alert, r);
    const removed = await Promise.all(
      keys.map(k => this.kv.remove('alert_history', k)),
    );
    return removed.filter(Boolean).length;
  }

  /** Newest non-ERROR row per group with `createdAt` in range. */
  /**
   * Every stored row of the alert in range, ERROR rows included, oldest
   * first. The product reads history through the grouped queries; this is
   * for tests and diagnostics that need the rows as written.
   */
  async rows(
    alert: Id,
    range: DateRange = {},
  ): Promise<(IAlertHistory & { _id: Id })[]> {
    const found = await this.deps.queries.historyRows(alert, range);
    return found.map(({ key, value }) => {
      const { errors, seq: _seq, ...d } = AlertHistoryDocSchema.parse(value);
      return {
        ...d,
        _id: key,
        createdAt: new Date(d.createdAt),
        lastValues: d.lastValues.map(v => ({
          ...v,
          startTime: new Date(v.startTime),
        })),
        ...(errors && {
          errors: errors.map(e => ({ ...e, timestamp: new Date(e.timestamp) })),
        }),
      };
    });
  }

  latestPerGroup(
    alert: Id,
    range: DateRange,
  ): Promise<AggregatedAlertHistory[]> {
    return this.deps.queries.latestPerGroup(alert, range);
  }

  rangeExcludingErrors(
    alert: Id,
    range: DateRange,
  ): Promise<AggregatedAlertHistory[]> {
    return this.deps.queries.rangeExcludingErrors(alert, range);
  }

  groupedByWindow(
    alert: Id,
    range: DateRange,
    limit: number,
  ): Promise<GroupedAlertHistory[]> {
    return this.deps.queries.groupedByWindow(alert, range, limit);
  }

  structuredWindows(
    alert: Id,
    range: DateRange,
    limit: number,
  ): Promise<StructuredWindow[]> {
    return this.deps.queries.structuredWindows(alert, range, limit);
  }

  transitionWindows(alert: Id, range: DateRange): Promise<TransitionWindow[]> {
    return this.deps.queries.transitionWindows(alert, range);
  }
}
