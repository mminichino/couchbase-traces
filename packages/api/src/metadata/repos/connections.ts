import { type Id, isValidId, newId } from '@/metadata/ids';
import {
  getDoc,
  mutateDoc,
  parseRows,
  type RepoDeps,
} from '@/metadata/repos/docs';
import { iso, toDate } from '@/metadata/schemas/common';
import {
  type ConnectionDoc,
  ConnectionDocSchema,
  type ConnectionInput,
  type ConnectionPatch,
  type IConnection,
} from '@/metadata/schemas/connection';

function toConnection(
  id: Id,
  d: ConnectionDoc,
  withSecrets: boolean,
): IConnection {
  const { password, tlsCaCertificate, monitorPassword, ...rest } = d;
  return {
    ...rest,
    ...(withSecrets && { password, tlsCaCertificate, monitorPassword }),
    _id: id,
    id,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  };
}

/** Parses through the schema so unknown fields drop, like Mongoose strict mode. */
function buildDoc(team: Id, input: ConnectionInput, now: Date): ConnectionDoc {
  return ConnectionDocSchema.parse({
    ...input,
    team,
    createdAt: iso(now),
    updatedAt: iso(now),
  });
}

const defined = (patch: ConnectionPatch) =>
  Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));

/**
 * `connections/<id>`. Secrets (`password`, `tlsCaCertificate`,
 * `monitorPassword`) are stored in the document and leave the repository only
 * through `getWithSecrets` or `get(…, { secrets: true })`, which replace
 * Mongoose's `select('+password …')`.
 */
export class ConnectionRepository {
  private readonly now: () => Date;

  constructor(private readonly deps: RepoDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private get kv() {
    return this.deps.kv;
  }

  async create(team: Id, input: ConnectionInput): Promise<IConnection> {
    const id = newId(this.now());
    const doc = buildDoc(team, input, this.now());
    await this.kv.insert('connections', id, doc);
    return toConnection(id, doc, false);
  }

  async get(
    team: Id,
    rawId: Id,
    o: { secrets?: boolean } = {},
  ): Promise<IConnection | null> {
    if (!isValidId(rawId)) return null;
    const id = rawId.toLowerCase();
    const doc = await getDoc(this.kv, ConnectionDocSchema, 'connections', id);
    return doc?.team === team
      ? toConnection(id, doc, o.secrets === true)
      : null;
  }

  /**
   * By id alone, secrets included: the data layer's loader has no team in
   * hand (a connection id is its cluster-cache key). Pass `team` to scope it.
   */
  async getWithSecrets(rawId: Id, team?: Id): Promise<IConnection | null> {
    if (!isValidId(rawId)) return null;
    const id = rawId.toLowerCase();
    const doc = await getDoc(this.kv, ConnectionDocSchema, 'connections', id);
    if (!doc || (team !== undefined && doc.team !== team)) return null;
    return toConnection(id, doc, true);
  }

  async exists(team: Id, id: Id): Promise<boolean> {
    return (await this.get(team, id)) != null;
  }

  async list(team: Id): Promise<IConnection[]> {
    const rows = await this.deps.find.find<unknown>('connections', {
      where: { team },
    });
    return parseRows(ConnectionDocSchema, 'connections', rows, (id, d) =>
      toConnection(id, d, false),
    ).sort((a, b) => (a._id < b._id ? -1 : 1));
  }

  async count(team: Id): Promise<number> {
    return this.deps.find.count('connections', { where: { team } });
  }

  /**
   * `$set` plus `$unset`: `undefined` values are skipped (Mongoose stripped
   * them), `team` and the id never change, and `unset` removes fields.
   */
  async update(
    team: Id,
    rawId: Id,
    patch: ConnectionPatch,
    unset: readonly string[] = [],
  ): Promise<IConnection | null> {
    if (!isValidId(rawId)) return null;
    const id = rawId.toLowerCase();
    const result = await mutateDoc(
      this.kv,
      ConnectionDocSchema,
      'connections',
      id,
      cur => {
        if (cur.team !== team) return null;
        const next = Object.fromEntries(
          Object.entries({ ...cur, ...defined(patch) }).filter(
            ([k]) => !unset.includes(k),
          ),
        );
        return ConnectionDocSchema.parse({
          ...next,
          team: cur.team,
          createdAt: cur.createdAt,
          updatedAt: iso(this.now()),
        });
      },
    );
    return result?.after.team === team
      ? toConnection(id, result.after, false)
      : null;
  }

  /** The deleted connection, or null when it is absent or another team's. */
  async delete(team: Id, id: Id): Promise<IConnection | null> {
    const cur = await this.get(team, id);
    if (!cur) return null;
    return (await this.kv.remove('connections', cur._id)) ? cur : null;
  }
}
