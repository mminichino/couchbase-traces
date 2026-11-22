import type { Id } from '@/metadata/ids';
import { AlertState, type IAlertError } from '@/metadata/schemas/alert';
import type {
  AggregatedAlertHistory,
  AlertHistoryDoc,
  DateRange,
  EvaluationWindowRow,
  GroupedAlertHistory,
  StructuredWindow,
  TransitionWindow,
} from '@/metadata/schemas/alertHistory';
import { compare, field } from '@/metadata/testing/memoryFind';
import type { MemoryKv } from '@/metadata/testing/memoryKv';
import type {
  AlertsPageQuery,
  Found,
  MetaAlertQueries,
} from '@/metadata/types';

type Row = { key: string; doc: AlertHistoryDoc };

const asDate = (s: string) => new Date(s);

function inRange(createdAt: string, r: DateRange): boolean {
  return (
    (!r.gte || createdAt >= r.gte.toISOString()) &&
    (!r.gt || createdAt > r.gt.toISOString()) &&
    (!r.lte || createdAt <= r.lte.toISOString()) &&
    (!r.lt || createdAt < r.lt.toISOString())
  );
}

const groupOf = (d: AlertHistoryDoc) => d.group ?? '';

/** Write order within one createdAt, as WRITE_ORDER in historySql.ts. */
const byWrite = (a: Row, b: Row) =>
  compare(a.doc.seq ?? null, b.doc.seq ?? null) || compare(a.key, b.key);

const errorsOf = (e: AlertHistoryDoc['errors']): IAlertError[] =>
  (e ?? []).map(x => ({ ...x, timestamp: asDate(x.timestamp) }));

const lastValuesOf = (d: AlertHistoryDoc) =>
  d.lastValues.map(v => ({ startTime: asDate(v.startTime), count: v.count }));

function aggregated(alert: Id, d: AlertHistoryDoc): AggregatedAlertHistory {
  return {
    _id: alert,
    createdAt: asDate(d.createdAt),
    state: d.state,
    ...(d.group !== undefined && { group: d.group }),
    ...(d.fired !== undefined && { fired: d.fired }),
    ...(d.groupValues !== undefined && { groupValues: d.groupValues }),
  };
}

/** MetaAlertQueries as scans over MemoryKv, mirroring the SQL++ semantics. */
export class MemoryAlertQueries implements MetaAlertQueries {
  constructor(private readonly kv: MemoryKv) {}

  private matching(q: Omit<AlertsPageQuery, 'limit'>): Found<unknown>[] {
    const name = (v: unknown) => field(v, 'displayName') ?? null;
    const tagSet = q.tags ? new Set(q.tags) : undefined;
    const search = q.search?.toLowerCase();
    const after = q.after;
    return this.kv
      .entries<unknown>('alerts')
      .filter(({ key, value: v }) => {
        const tags = field(v, 'tags');
        const n = name(v);
        return (
          field(v, 'team') === q.team &&
          (!tagSet ||
            (Array.isArray(tags) && tags.some(t => tagSet.has(String(t))))) &&
          (!q.states || q.states.includes(String(field(v, 'state') ?? 'OK'))) &&
          (!q.sources ||
            q.sources.includes(String(field(v, 'source') ?? 'saved_search'))) &&
          (search == null ||
            (typeof n === 'string' && n.toLowerCase().includes(search))) &&
          (!q.createdBy || field(v, 'createdBy') === q.createdBy) &&
          (!after ||
            (after.name === null
              ? (n === null && key > after.id) || typeof n === 'string'
              : typeof n === 'string' &&
                (compare(n, after.name) > 0 ||
                  (n === after.name && key > after.id))))
        );
      })
      .sort(
        (a, b) =>
          compare(name(a.value), name(b.value)) || compare(a.key, b.key),
      );
  }

  async alertsPage(q: AlertsPageQuery): Promise<Found<unknown>[]> {
    const rows = this.matching(q);
    return q.limit == null ? rows : rows.slice(0, q.limit);
  }

  async alertsCount(q: Omit<AlertsPageQuery, 'after' | 'limit'>) {
    return this.matching(q).length;
  }

  private rows(alert: Id, r: DateRange, errors: 'any' | 'only' | 'none') {
    return this.kv
      .entries<AlertHistoryDoc>('alert_history')
      .filter(
        ({ value: d }) =>
          d.alert === alert &&
          inRange(d.createdAt, r) &&
          (errors === 'any' ||
            (errors === 'only') === (d.state === AlertState.ERROR)),
      )
      .map((e): Row => ({ key: e.key, doc: e.value }));
  }

  async latestPerGroup(alert: Id, range: DateRange) {
    const best = new Map<string, Row>();
    for (const r of this.rows(alert, range, 'none')) {
      const cur = best.get(groupOf(r.doc));
      if (
        !cur ||
        r.doc.createdAt > cur.doc.createdAt ||
        (r.doc.createdAt === cur.doc.createdAt && byWrite(r, cur) > 0)
      ) {
        best.set(groupOf(r.doc), r);
      }
    }
    return [...best.values()].map(r => aggregated(alert, r.doc));
  }

  async rangeExcludingErrors(alert: Id, range: DateRange) {
    return this.rows(alert, range, 'none')
      .sort(
        (a, b) =>
          compare(a.doc.group, b.doc.group) ||
          compare(b.doc.createdAt, a.doc.createdAt) ||
          byWrite(b, a),
      )
      .map(r => aggregated(alert, r.doc));
  }

  /** Rows bucketed by createdAt, oldest or newest first, in write order. */
  private windows(
    alert: Id,
    range: DateRange,
    errors: 'any' | 'none',
    dir: 'asc' | 'desc',
  ): [string, AlertHistoryDoc[]][] {
    const by = new Map<string, AlertHistoryDoc[]>();
    for (const { doc } of this.rows(alert, range, errors).sort(byWrite)) {
      by.set(doc.createdAt, [...(by.get(doc.createdAt) ?? []), doc]);
    }
    const sign = dir === 'asc' ? 1 : -1;
    return [...by].sort(([a], [b]) => sign * compare(a, b));
  }

  async groupedByWindow(
    alert: Id,
    range: DateRange,
    limit: number,
  ): Promise<GroupedAlertHistory[]> {
    return this.windows(alert, range, 'any', 'desc')
      .slice(0, limit)
      .map(([at, docs]) => ({
        createdAt: asDate(at),
        states: docs.map(d => d.state),
        counts: docs.reduce((n, d) => n + d.counts, 0),
        lastValues: docs.map(lastValuesOf),
        errors: docs.flatMap(d => (d.errors ? [errorsOf(d.errors)] : [])),
      }));
  }

  async structuredWindows(
    alert: Id,
    range: DateRange,
    limit: number,
  ): Promise<StructuredWindow[]> {
    return this.windows(alert, range, 'any', 'desc')
      .slice(0, limit)
      .map(([at, docs]) => ({
        createdAt: asDate(at),
        rows: docs.map(
          (d): EvaluationWindowRow => ({
            ...(d.group !== undefined && { group: d.group }),
            state: d.state,
            counts: d.counts,
            lastValues: lastValuesOf(d),
            ...(d.fired !== undefined && { fired: d.fired }),
            ...(d.errors && { errors: errorsOf(d.errors) }),
            ...(d.analytics && { analytics: d.analytics }),
          }),
        ),
      }));
  }

  async transitionWindows(
    alert: Id,
    range: DateRange,
  ): Promise<TransitionWindow[]> {
    return this.windows(alert, range, 'none', 'asc').map(([at, docs]) => ({
      createdAt: asDate(at),
      states: docs.map(d => d.state),
      bucketStarts: docs.map(d => d.lastValues.map(v => asDate(v.startTime))),
    }));
  }

  async historyRows(alert: Id, range: DateRange): Promise<Found<unknown>[]> {
    return this.rows(alert, range, 'any')
      .sort(
        (a, b) => compare(a.doc.createdAt, b.doc.createdAt) || byWrite(a, b),
      )
      .map(r => ({ key: r.key, value: r.doc }));
  }

  async errorRowKeys(alert: Id, range: DateRange) {
    return this.rows(alert, range, 'only').map(r => r.key);
  }
}
