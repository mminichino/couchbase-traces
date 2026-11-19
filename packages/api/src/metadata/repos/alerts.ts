import { ValidationError } from '@/metadata/errors';
import type { Id } from '@/metadata/ids';
import { mutateDoc, parseRows, type RepoDeps } from '@/metadata/repos/docs';
import { definedOnly, TeamDocs } from '@/metadata/repos/teamDocs';
import {
  type AlertDoc,
  AlertDocSchema,
  type AlertFields,
  alertFieldsViolation,
  AlertSource,
  type AlertState,
  type IAlert,
  type IAlertError,
} from '@/metadata/schemas/alert';
import { iso, toDate } from '@/metadata/schemas/common';
import { FIND_LIMIT_MAX, type FindScalar, KEY_FIELD } from '@/metadata/types';

function toAlert(id: Id, d: AlertDoc): IAlert {
  // The Mixed fields (`channel`, `chartConfig`) are validated by the API
  // layer on write, as they were over Mongoose's Mixed type.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  return {
    ...d,
    _id: id,
    id,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
    ...(d.scheduleStartAt !== undefined && {
      scheduleStartAt: toDate(d.scheduleStartAt),
    }),
    ...(d.silenced && {
      silenced: {
        ...d.silenced,
        at: toDate(d.silenced.at),
        until: toDate(d.silenced.until),
      },
    }),
    ...(d.executionErrors && {
      executionErrors: d.executionErrors.map(e => ({
        ...e,
        timestamp: toDate(e.timestamp),
      })),
    }),
  } as IAlert;
}

/** Fields as the controllers build them (Dates), as stored (ISO strings). */
function toStored(f: AlertFields): Partial<AlertDoc> {
  const { scheduleStartAt, ...rest } = f;
  return {
    ...rest,
    ...(scheduleStartAt !== undefined && {
      scheduleStartAt: scheduleStartAt == null ? null : iso(scheduleStartAt),
    }),
  };
}

const errorsToStored = (errors: IAlertError[]) =>
  errors.map(e => ({ ...e, timestamp: iso(e.timestamp) }));

export type AlertsPageFilter = {
  tags?: readonly string[];
  states?: readonly string[];
  sources?: readonly string[];
  search?: string;
  createdBy?: Id;
};

/** Where the keyset stops: the sort key of the last row of the page. */
export type AlertsCursor = { name: string | null; id: Id };

/** `alerts/<id>`. */
export class AlertRepository extends TeamDocs<AlertDoc, IAlert> {
  constructor(deps: RepoDeps) {
    super(deps, 'alerts', AlertDocSchema, toAlert);
  }

  /** Enforces the schema rules Mongoose applied on save. */
  async create(team: Id, fields: AlertFields): Promise<IAlert> {
    const problem = alertFieldsViolation(fields);
    if (problem) throw new ValidationError(problem);
    return this.insertDoc(this.fresh({ ...toStored(fields), team }));
  }

  /**
   * `$set` semantics: defined fields overwrite, null clears. `clearThresholdMax`
   * drops a stored upper bound, which `$set` alone could not (the comparator
   * is no longer a range).
   */
  async update(
    team: Id,
    id: Id,
    fields: AlertFields,
    o: { clearThresholdMax?: boolean } = {},
  ): Promise<IAlert | null> {
    const patch = definedOnly(toStored(fields));
    const r = await this.mutate(team, id, cur => {
      const { thresholdMax, ...rest } = { ...cur, ...patch };
      return o.clearThresholdMax ? rest : { ...rest, thresholdMax };
    });
    return r ? toAlert(r.id, r.after) : null;
  }

  /** Silences the alert until a time, or un-silences it with `null`. */
  async setSilenced(
    team: Id,
    id: Id,
    silenced: { by?: Id; at: Date; until: Date } | null,
  ): Promise<IAlert | null> {
    const r = await this.mutate(team, id, cur => {
      const { silenced: _previous, ...rest } = cur;
      return silenced == null
        ? rest
        : {
            ...rest,
            silenced: {
              ...(silenced.by && { by: silenced.by }),
              at: iso(silenced.at),
              until: iso(silenced.until),
            },
          };
    });
    return r ? toAlert(r.id, r.after) : null;
  }

  /**
   * Updates the tile alert for (dashboard, tile) or creates it. `userId`
   * becomes `createdBy` only when the alert has none yet.
   */
  async upsertTile(
    team: Id,
    ref: { dashboard: Id; tileId: string },
    fields: AlertFields,
    o: { userId?: Id; clearThresholdMax?: boolean } = {},
  ): Promise<IAlert> {
    const [existing] = await this.list(team, {
      ...ref,
      source: AlertSource.TILE,
    });
    if (existing) {
      const owner =
        !existing.createdBy && o.userId ? { createdBy: o.userId } : {};
      const updated = await this.update(
        team,
        existing._id,
        { ...fields, ...owner },
        o,
      );
      if (updated) return updated;
    }
    return this.create(team, {
      ...fields,
      ...(o.userId && { createdBy: o.userId }),
    });
  }

  /** The scheduler's read: every alert of every team, in id order. */
  async listAll(): Promise<IAlert[]> {
    const out: IAlert[] = [];
    for (let offset = 0; ; offset += FIND_LIMIT_MAX) {
      const rows = await this.deps.find.find<unknown>('alerts', {
        present: ['team'],
        orderBy: [{ field: KEY_FIELD, dir: 'asc' }],
        offset,
      });
      out.push(...parseRows(AlertDocSchema, 'alerts', rows, toAlert));
      if (rows.length < FIND_LIMIT_MAX) return out;
    }
  }

  /** Every match, paged past the 1000-row find cap. */
  async listEvery(
    team: Id,
    where: Record<string, FindScalar> = {},
  ): Promise<IAlert[]> {
    const out: IAlert[] = [];
    for (let offset = 0; ; offset += FIND_LIMIT_MAX) {
      const rows = await this.list(team, where, { offset });
      out.push(...rows);
      if (rows.length < FIND_LIMIT_MAX) return out;
    }
  }

  findBySavedSearch(team: Id, savedSearch: Id): Promise<IAlert[]> {
    return this.listEvery(team, { savedSearch });
  }

  async findByDashboard(
    team: Id,
    scope: { dashboard: Id; tileIds?: readonly string[] },
  ): Promise<IAlert[]> {
    const rows = await this.listEvery(team, {
      dashboard: scope.dashboard,
      source: AlertSource.TILE,
    });
    const tiles = scope.tileIds && new Set(scope.tileIds);
    return tiles ? rows.filter(a => a.tileId && tiles.has(a.tileId)) : rows;
  }

  /** All tile alerts of a team (the dashboards list decorates tiles). */
  findTileAlerts(team: Id): Promise<IAlert[]> {
    return this.listEvery(team, { source: AlertSource.TILE });
  }

  /** Alerts that notify this webhook, through `channel` or any `channels`. */
  async countByWebhook(team: Id, webhookId: string): Promise<number> {
    return this.count(team, { 'channel.webhookId': webhookId });
  }

  /**
   * One page in `(displayName, id)` order. One extra row answers "is there
   * more?" without a second count query; omitting `limit` returns everything.
   */
  async page(
    team: Id,
    f: AlertsPageFilter,
    o: { after?: AlertsCursor; limit?: number } = {},
  ): Promise<{ items: IAlert[]; hasMore: boolean }> {
    const { limit } = o;
    const rows = await this.deps.queries.alertsPage({
      team,
      ...f,
      after: o.after,
      limit: limit == null ? undefined : limit + 1,
    });
    const items = parseRows(AlertDocSchema, 'alerts', rows, toAlert);
    const hasMore = limit != null && items.length > limit;
    return { items: hasMore ? items.slice(0, limit) : items, hasMore };
  }

  countPage(team: Id, f: AlertsPageFilter): Promise<number> {
    return this.deps.queries.alertsCount({ team, ...f });
  }

  /**
   * The scheduler's write. It touches only `state` and `executionErrors`, so
   * a concurrent user edit of another field survives (Mongo `$set` parity),
   * and bumps `updatedAt` as `updateOne` with timestamps did.
   */
  async setState(
    id: Id,
    state: AlertState,
    errors: IAlertError[],
  ): Promise<void> {
    await this.setFields(id, { state, executionErrors: errors });
  }

  async setExecutionErrors(id: Id, errors: IAlertError[]): Promise<void> {
    await this.setFields(id, { executionErrors: errors });
  }

  private async setFields(
    id: Id,
    f: { state?: AlertState; executionErrors: IAlertError[] },
  ): Promise<void> {
    await mutateDoc(this.kv, AlertDocSchema, 'alerts', id, cur => ({
      ...cur,
      ...(f.state && { state: f.state }),
      executionErrors: errorsToStored(f.executionErrors),
      updatedAt: iso(this.now()),
    }));
  }

  /** Deletes the tile alerts of a dashboard, or of some of its tiles. */
  async deleteByDashboard(
    team: Id,
    dashboard: Id,
    tileIds?: readonly string[],
  ): Promise<number> {
    const rows = await this.findByDashboard(team, { dashboard, tileIds });
    const results = await Promise.all(
      rows.map(a => this.kv.remove('alerts', a._id)),
    );
    return results.filter(Boolean).length;
  }
}
