/**
 * Integration-test stand-ins for the `Alert` and `AlertHistory` model calls
 * the ported tests made (`create`, `findById`, `find`, `countDocuments`,
 * `updateOne`, ...). Filters and updates are the small Mongo subset those
 * tests used; they run over the metadata store, with raw writes that skip
 * the repositories' rules so tests can build legacy-shaped documents.
 */
import get from 'lodash/get';
import set from 'lodash/set';
import unset from 'lodash/unset';

import { hydrateAlertRefs } from '@/controllers/alertRefs';
import { getMetadataStore } from '@/metadata';
import { type Id, newId } from '@/metadata/ids';
import type { IAlert } from '@/metadata/schemas/alert';
import type { IAlertHistory } from '@/metadata/schemas/alertHistory';
import { loose } from '@/metadata/testing/loose';

type Doc = Record<string, unknown>;
type Filter = Record<string, unknown>;
type Update = Record<string, unknown>;

/** Ids arrive as strings or ObjectIds; Dates compare by instant. */
function norm(v: unknown): unknown {
  if (v instanceof Date) return v.getTime();
  if (v != null && typeof v === 'object' && 'toHexString' in v) {
    return String(v);
  }
  return v;
}

const isOps = (c: unknown): c is Record<string, unknown> =>
  c != null &&
  typeof c === 'object' &&
  !(c instanceof Date) &&
  Object.keys(c).some(k => k.startsWith('$'));

function matchesField(actual: unknown, cond: unknown): boolean {
  if (!isOps(cond)) return norm(actual) === norm(cond);
  return Object.entries(cond).every(([op, arg]) => {
    const a = norm(actual);
    switch (op) {
      case '$ne':
        return a !== norm(arg);
      case '$gt': {
        const b = norm(arg);
        return typeof a === 'number' && typeof b === 'number' && a > b;
      }
      case '$in':
        return Array.isArray(arg) && arg.map(norm).includes(a);
      default:
        throw new Error(`seedAlerts: unsupported operator ${op}`);
    }
  });
}

function matches(doc: Doc, filter: Filter): boolean {
  return Object.entries(filter).every(([k, cond]) =>
    k === '$or'
      ? Array.isArray(cond) && cond.some(f => matches(doc, loose<Filter>(f)))
      : matchesField(get(doc, k), cond),
  );
}

/** Dates become ISO strings, ObjectIds become hex strings: the stored shape. */
function stored(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(stored);
  if (v != null && typeof v === 'object') {
    if ('toHexString' in v) return String(v);
    return Object.fromEntries(
      Object.entries(v)
        .filter(([, x]) => x !== undefined)
        .map(([k, x]) => [k, stored(x)]),
    );
  }
  return v;
}

function applyUpdate(doc: Doc, update: Update): Doc {
  const next: Doc = structuredClone(doc);
  const ops = isOps(update) ? update : { $set: update };
  for (const [k, v] of Object.entries(loose<Doc>(ops.$set ?? {}))) {
    set(next, k, stored(v));
  }
  for (const k of Object.keys(loose<Doc>(ops.$unset ?? {}))) unset(next, k);
  return next;
}

/** A awaitable read with the few chain steps the tests used. */
class Query<T> implements PromiseLike<T> {
  constructor(
    private readonly run: () => Promise<T>,
    private readonly hydrate = false,
  ) {}

  sort(spec: Record<string, 1 | -1>): Query<T> {
    return new Query(async () => {
      const out = await this.run();
      if (!Array.isArray(out)) return out;
      const sorted = [...out].sort((a, b) => {
        for (const [k, dir] of Object.entries(spec)) {
          const x = norm(get(a, k)) ?? '';
          const y = norm(get(b, k)) ?? '';
          if (x !== y) return (x < y ? -1 : 1) * dir;
        }
        return 0;
      });
      return loose<T>(sorted);
    }, this.hydrate);
  }

  /** Reads are already plain objects. */
  lean(): Query<T> {
    return this;
  }

  /** Resolves `savedSearch` and `dashboard`; `team` stays an id. */
  populate(_paths: unknown): Query<T> {
    return new Query(this.run, true);
  }

  then<R1 = T, R2 = never>(
    onOk?: ((v: T) => R1 | PromiseLike<R1>) | null,
    onErr?: ((e: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.resolve().then(onOk, onErr);
  }

  private async resolve(): Promise<T> {
    const out = await this.run();
    if (!this.hydrate || out == null) return out;
    const one = loose<IAlert>(out);
    const [h] = await hydrateAlertRefs(one.team, [one]);
    return loose<T>(h);
  }
}

// -- alerts -----------------------------------------------------------------

const alertsAll = () => getMetadataStore().alerts.listAll();

async function insertAlert(input: Doc): Promise<IAlert> {
  const id = input._id != null ? String(norm(input._id)) : newId();
  const at = new Date().toISOString();
  const { _id: _ignored, ...rest } = loose<Doc>(stored(input));
  await getMetadataStore().kv.insert('alerts', id, {
    state: 'OK',
    source: 'saved_search',
    createdAt: at,
    updatedAt: at,
    ...rest,
  });
  const made = await findAlertById(id);
  if (!made) throw new Error(`alert ${id} was not stored`);
  return made;
}

async function patchAlerts(filter: Filter, update: Update, all: boolean) {
  const kv = getMetadataStore().kv;
  const hits = (await alertsAll()).filter(a => matches(loose<Doc>(a), filter));
  for (const a of all ? hits : hits.slice(0, 1)) {
    const cur = await kv.get<Doc>('alerts', a._id);
    if (cur) await kv.replace('alerts', a._id, applyUpdate(cur.value, update));
  }
}

const findAlertById = async (id: unknown): Promise<IAlert | null> =>
  (await alertsAll()).find(a => a._id === String(norm(id))) ?? null;

export const alertDocs = {
  create: insertAlert,
  findById: (id: unknown) => new Query(() => findAlertById(id)),
  findOne: (filter: Filter) =>
    new Query(
      async () =>
        (await alertsAll()).find(a => matches(loose<Doc>(a), filter)) ?? null,
    ),
  find: (filter: Filter = {}) =>
    new Query(async () =>
      (await alertsAll()).filter(a => matches(loose<Doc>(a), filter)),
    ),
  countDocuments: async (filter: Filter = {}) =>
    (await alertsAll()).filter(a => matches(loose<Doc>(a), filter)).length,
  insertMany: (docs: Doc[]) => Promise.all(docs.map(insertAlert)),
  updateOne: (filter: Filter, update: Update) =>
    patchAlerts(filter, update, false),
  updateMany: (filter: Filter, update: Update) =>
    patchAlerts(filter, update, true),
  findByIdAndUpdate: (id: unknown, update: Update) =>
    patchAlerts({ _id: id }, update, false),
  findByIdAndDelete: async (id: unknown) => {
    await getMetadataStore().kv.remove('alerts', String(norm(id)));
  },
  deleteMany: async (filter: Filter) => {
    const kv = getMetadataStore().kv;
    for (const a of await alertsAll()) {
      if (matches(loose<Doc>(a), filter)) await kv.remove('alerts', a._id);
    }
  },
  /** Raw write of a document exactly as given (no defaults). */
  insertRaw: async (doc: Doc) => {
    const { _id, ...rest } = loose<Doc>(stored(doc));
    const at = new Date().toISOString();
    await getMetadataStore().kv.insert(
      'alerts',
      _id != null ? String(_id) : newId(),
      { createdAt: at, updatedAt: at, ...rest },
    );
  },
};

// -- alert history ----------------------------------------------------------

type HistoryRow = IAlertHistory & { _id: Id };

async function historyOf(filter: Filter): Promise<HistoryRow[]> {
  const alert = norm(filter.alert);
  if (typeof alert !== 'string') {
    throw new Error('seedAlerts: alert history reads need an `alert` filter');
  }
  const rows = await getMetadataStore().alertHistory.rows(alert);
  return rows.filter(r => matches(loose<Doc>(r), filter));
}

async function writeHistory(rows: Doc[]): Promise<void> {
  const results = await getMetadataStore().alertHistory.createMany(
    rows.map(r =>
      loose<IAlertHistory>({
        counts: 0,
        lastValues: [],
        ...r,
        alert: String(norm(r.alert)),
      }),
    ),
  );
  const failed = results.find(r => r.status === 'rejected');
  if (failed?.status === 'rejected') throw failed.reason;
}

export const alertHistoryDocs = {
  create: (rows: Doc | Doc[]) =>
    writeHistory(Array.isArray(rows) ? rows : [rows]),
  insertMany: writeHistory,
  find: (filter: Filter) => new Query(() => historyOf(filter)),
  findOne: (filter: Filter) =>
    new Query(async () => (await historyOf(filter))[0] ?? null),
  countDocuments: async (filter: Filter) => (await historyOf(filter)).length,
  /** Raw patch of every row of the alert, as the Mongo `updateMany` did. */
  updateMany: async (filter: Filter, update: Update) => {
    const kv = getMetadataStore().kv;
    for (const r of await historyOf(filter)) {
      const cur = await kv.get<Doc>('alert_history', r._id);
      if (cur) {
        await kv.replace(
          'alert_history',
          r._id,
          applyUpdate(cur.value, update),
          {
            preserveExpiry: true,
          },
        );
      }
    }
  },
};
