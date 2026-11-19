import {
  buildAlertsCount,
  buildAlertsPage,
} from '@/metadata/couchbase/alertPageSql';
import type { MetadataConfig } from '@/metadata/couchbase/config';
import {
  buildErrorRowKeys,
  buildGroupedByWindow,
  buildHistoryRows,
  buildLatestPerGroup,
  buildRangeExcludingErrors,
  buildStructuredWindows,
  buildTransitionWindows,
} from '@/metadata/couchbase/historySql';
import { type QueryPort, runQuery } from '@/metadata/couchbase/query';
import type { Id } from '@/metadata/ids';
import type { AlertState, IAlertError } from '@/metadata/schemas/alert';
import type {
  AggregatedAlertHistory,
  DateRange,
  EvaluationWindowRow,
  GroupedAlertHistory,
  GroupValue,
  StructuredWindow,
  TransitionWindow,
} from '@/metadata/schemas/alertHistory';
import type {
  AlertsPageQuery,
  Found,
  MetaAlertQueries,
} from '@/metadata/types';

type Cfg = Pick<
  MetadataConfig,
  'bucket' | 'scope' | 'password' | 'queryTimeoutMs'
>;

// Rows as SQL++ returns them: ISO strings for instants, MISSING members absent.
type RowLastValue = { startTime: string; count: number };
type RowError = Omit<IAlertError, 'timestamp'> & { timestamp: string };
type AggRow = {
  createdAt: string;
  state: AlertState;
  group?: string;
  fired?: boolean;
  groupValues?: GroupValue[] | null;
};

const asDate = (s: string) => new Date(s);
const lastValues = (v: RowLastValue[]) =>
  v.map(x => ({ startTime: asDate(x.startTime), count: x.count }));
const errors = (e: RowError[]): IAlertError[] =>
  e.map(x => ({ ...x, timestamp: asDate(x.timestamp) }));

function toAggregated(alert: Id, r: AggRow): AggregatedAlertHistory {
  return {
    _id: alert,
    createdAt: asDate(r.createdAt),
    state: r.state,
    ...(r.group !== undefined && { group: r.group }),
    ...(r.fired !== undefined && { fired: r.fired }),
    ...(r.groupValues !== undefined && { groupValues: r.groupValues }),
  };
}

/** The alert reads FindSpec cannot express, as SQL++ with request_plus. */
export class CouchbaseAlertQueries implements MetaAlertQueries {
  constructor(
    private readonly cluster: QueryPort,
    private readonly cfg: Cfg,
  ) {}

  private bound() {
    return {
      timeoutMs: this.cfg.queryTimeoutMs,
      secrets: [this.cfg.password],
    };
  }

  async alertsPage(q: AlertsPageQuery): Promise<Found<unknown>[]> {
    const rows = await runQuery<{ k: string; v: unknown }>(
      this.cluster,
      buildAlertsPage(this.cfg, q),
      undefined,
      this.bound(),
    );
    return rows.map(r => ({ key: r.k, value: r.v }));
  }

  async alertsCount(q: Omit<AlertsPageQuery, 'after' | 'limit'>) {
    const [n] = await runQuery<number>(
      this.cluster,
      buildAlertsCount(this.cfg, q),
      undefined,
      this.bound(),
    );
    return n ?? 0;
  }

  async latestPerGroup(alert: Id, range: DateRange) {
    const rows = await runQuery<AggRow>(
      this.cluster,
      buildLatestPerGroup(this.cfg, alert, range),
      undefined,
      this.bound(),
    );
    return rows.map(r => toAggregated(alert, r));
  }

  async rangeExcludingErrors(alert: Id, range: DateRange) {
    const rows = await runQuery<AggRow>(
      this.cluster,
      buildRangeExcludingErrors(this.cfg, alert, range),
      undefined,
      this.bound(),
    );
    return rows.map(r => toAggregated(alert, r));
  }

  async groupedByWindow(
    alert: Id,
    range: DateRange,
    limit: number,
  ): Promise<GroupedAlertHistory[]> {
    const rows = await runQuery<{
      createdAt: string;
      states: AlertState[];
      counts: number;
      lastValues: RowLastValue[][];
      errors: RowError[][];
    }>(
      this.cluster,
      buildGroupedByWindow(this.cfg, alert, range, limit),
      undefined,
      this.bound(),
    );
    return rows.map(r => ({
      createdAt: asDate(r.createdAt),
      states: r.states,
      counts: r.counts,
      // ARRAY_AGG over only-MISSING values yields null, not [].
      lastValues: (r.lastValues ?? []).map(lastValues),
      errors: (r.errors ?? []).map(errors),
    }));
  }

  async structuredWindows(
    alert: Id,
    range: DateRange,
    limit: number,
  ): Promise<StructuredWindow[]> {
    type Row = Omit<EvaluationWindowRow, 'lastValues' | 'errors'> & {
      lastValues?: RowLastValue[];
      errors?: RowError[];
    };
    const rows = await runQuery<{ createdAt: string; rows: Row[] }>(
      this.cluster,
      buildStructuredWindows(this.cfg, alert, range, limit),
      undefined,
      this.bound(),
    );
    return rows.map(w => ({
      createdAt: asDate(w.createdAt),
      rows: w.rows.map(({ lastValues: lv, errors: er, ...r }) => ({
        ...r,
        ...(lv && { lastValues: lastValues(lv) }),
        ...(er && { errors: errors(er) }),
      })),
    }));
  }

  async transitionWindows(
    alert: Id,
    range: DateRange,
  ): Promise<TransitionWindow[]> {
    const rows = await runQuery<{
      createdAt: string;
      states: AlertState[];
      bucketStarts: string[][];
    }>(
      this.cluster,
      buildTransitionWindows(this.cfg, alert, range),
      undefined,
      this.bound(),
    );
    return rows.map(r => ({
      createdAt: asDate(r.createdAt),
      states: r.states,
      bucketStarts: r.bucketStarts.map(b => b.map(asDate)),
    }));
  }

  async historyRows(alert: Id, range: DateRange): Promise<Found<unknown>[]> {
    const rows = await runQuery<{ k: string; v: unknown }>(
      this.cluster,
      buildHistoryRows(this.cfg, alert, range),
      undefined,
      this.bound(),
    );
    return rows.map(r => ({ key: r.k, value: r.v }));
  }

  errorRowKeys(alert: Id, range: DateRange): Promise<string[]> {
    return runQuery<string>(
      this.cluster,
      buildErrorRowKeys(this.cfg, alert, range),
      undefined,
      this.bound(),
    );
  }
}
