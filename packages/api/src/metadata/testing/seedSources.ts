/**
 * Integration-test seeding for connections and sources: the stand-ins for
 * `Connection.create`, `Source.create`, and the raw-collection calls the
 * ported tests used.
 */
import { getMetadataStore } from '@/metadata';
import { type Id, newId } from '@/metadata/ids';
import { iso } from '@/metadata/schemas/common';
import {
  type ConnectionDoc,
  ConnectionDocSchema,
  type ConnectionInput,
  type IConnection,
} from '@/metadata/schemas/connection';
import type {
  SourceDoc,
  SourceDocument,
  SourceInput,
} from '@/metadata/schemas/source';

type IdLike = Id | { toString(): string } | null | undefined;

const idOf = (v: IdLike): Id => (v == null ? '' : v.toString());

type ConnectionSeed = Omit<ConnectionInput, 'kind'> & {
  team: Id | { toString(): string };
  kind?: IConnection['kind'];
  /** Fixed id, for tests whose sources already reference one. */
  _id?: Id;
};

/** `Connection.create`; the result carries secrets, as the Mongoose doc did. */
export async function seedConnection(
  input: ConnectionSeed,
): Promise<IConnection> {
  const { team, _id, ...rest } = input;
  const store = getMetadataStore();
  const id = (_id ?? newId()).toLowerCase();
  const at = iso(new Date());
  const doc = ConnectionDocSchema.parse({
    ...rest,
    team: idOf(team),
    createdAt: at,
    updatedAt: at,
  });
  await store.kv.insert('connections', id, doc);
  return (await store.connections.getWithSecrets(id))!;
}

/** `Connection.findById(id)`, secrets included. */
export function findConnection(id: IdLike): Promise<IConnection | null> {
  if (id == null) return Promise.resolve(null);
  return getMetadataStore().connections.getWithSecrets(idOf(id));
}

/** `Connection.deleteOne({ _id })`. */
export async function removeConnection(id: IdLike): Promise<void> {
  const doc = await findConnection(id);
  if (doc) await getMetadataStore().connections.delete(doc.team, doc._id);
}

/** `Connection.countDocuments()` for one team. */
export async function countConnections(team?: IdLike): Promise<number> {
  const store = getMetadataStore();
  if (team != null) return store.connections.count(idOf(team));
  const teams = await store.teams.listAll();
  const counts = await Promise.all(
    teams.map(t => store.connections.count(t._id)),
  );
  return counts.reduce((a, b) => a + b, 0);
}

/** `Model.updateOne({ _id }, { $set })` on a connection. */
export async function patchConnection(
  id: IdLike,
  patch: Partial<ConnectionDoc>,
): Promise<void> {
  const kv = getMetadataStore().kv;
  const cur = await kv.get<ConnectionDoc>('connections', idOf(id));
  if (!cur) throw new Error(`connections/${idOf(id)} not found`);
  await kv.replace('connections', idOf(id), { ...cur.value, ...patch });
}

/**
 * Loose on purpose: the ported tests pass partial metric tables, legacy
 * field names, and string kinds that the old Mongoose models accepted (or
 * silently stripped). `sanitizeSource` still applies the per-kind whitelist.
 */
export type SourceSeed = {
  kind: SourceInput['kind'] | `${SourceInput['kind']}`;
  team: Id | { toString(): string };
  connection: Id | { toString(): string };
  [field: string]: unknown;
};

/** `Source.create` and the per-kind discriminator `create`s. */
export async function seedSource(input: SourceSeed): Promise<SourceDocument> {
  return getMetadataStore().sources.create(idOf(input.team), {
    ...input,
    connection: idOf(input.connection),
  } as unknown as SourceInput);
}

/**
 * Writes a source document as given, skipping the repository's field
 * whitelist. Replaces `Source.collection.insertOne`, for legacy shapes and
 * invalid kinds the repository refuses to write.
 */
export async function seedRawSource(
  doc: Record<string, unknown> & { team: IdLike },
): Promise<Id> {
  const at = iso(new Date());
  const id = newId();
  const body = {
    createdAt: at,
    updatedAt: at,
    ...doc,
    team: idOf(doc.team),
    ...(doc.connection == null
      ? {}
      : { connection: idOf(doc.connection as IdLike) }),
  };
  await getMetadataStore().kv.insert('sources', id, body);
  return id;
}

/** `Source.collection.findOne({ _id })`: the stored JSON, dates as ISO. */
export async function getSourceDoc(id: IdLike): Promise<SourceDoc | null> {
  return (
    (await getMetadataStore().kv.get<SourceDoc>('sources', idOf(id)))?.value ??
    null
  );
}

/** `Source.findById(id)` and the per-kind variants. */
export async function findSource(id: IdLike): Promise<SourceDocument | null> {
  const raw = await getSourceDoc(id);
  return raw ? getMetadataStore().sources.get(raw.team, idOf(id)) : null;
}

/** `Source.find({ team })`, oldest first; no team lists every team's. */
export async function listSources(team?: IdLike): Promise<SourceDocument[]> {
  const store = getMetadataStore();
  if (team != null) return store.sources.list(idOf(team));
  const teams = await store.teams.listAll();
  return (await Promise.all(teams.map(t => store.sources.list(t._id)))).flat();
}

/** `Source.findByIdAndDelete(id)` and `Source.deleteOne({ _id })`. */
export async function removeSource(id: IdLike): Promise<void> {
  const raw = await getSourceDoc(id);
  if (raw) await getMetadataStore().sources.delete(raw.team, idOf(id));
}

/**
 * `Source.updateOne({ _id }, { $set })` and `Source.collection.updateOne`.
 * Merges into the stored JSON without the whitelist, so kind-specific
 * fields set on another kind still land (the old tests used the raw
 * collection for exactly that).
 */
export async function patchSource(
  id: IdLike,
  patch: Record<string, unknown>,
): Promise<void> {
  const kv = getMetadataStore().kv;
  const cur = await kv.get<Record<string, unknown>>('sources', idOf(id));
  if (!cur) throw new Error(`sources/${idOf(id)} not found`);
  const next = { ...cur.value, ...patch };
  if (patch.connection != null)
    next.connection = idOf(patch.connection as IdLike);
  await kv.replace('sources', idOf(id), next);
}

/** `doc.get('field')` for kind-specific fields the union does not narrow. */
export function sourceField(
  doc: SourceDocument | null | undefined,
  key: string,
): any {
  return doc == null ? undefined : Reflect.get(doc, key);
}
