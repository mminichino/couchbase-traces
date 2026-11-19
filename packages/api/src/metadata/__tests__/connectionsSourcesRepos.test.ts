import { SourceKind } from '@couchbase-traces/common-utils/dist/types';

import { ValidationError } from '@/metadata/errors';
import { newId } from '@/metadata/ids';
import type { SourceInput } from '@/metadata/schemas/source';
import { createMemoryStore } from '@/metadata/testing/memoryStore';
import { sourceField } from '@/metadata/testing/seed';

const TEAM = newId();
const OTHER_TEAM = newId();

const connectionInput = {
  name: 'Primary',
  host: 'couchbase://localhost',
  username: 'admin',
  password: 'secret-pw',
  kind: 'couchbase' as const,
};

function setup() {
  let now = new Date('2026-01-01T00:00:00Z');
  const store = createMemoryStore({ now: () => now });
  return {
    store,
    advance: (ms: number) => {
      now = new Date(now.getTime() + ms);
    },
  };
}

/** Inputs the types forbid, to prove the repository still rejects them. */
const loose = (v: object): SourceInput => v as unknown as SourceInput;

const logSource = (connection: string, extra: object = {}) => ({
  kind: SourceKind.Log as const,
  name: 'Logs',
  connection,
  from: { databaseName: 'otel', tableName: 'otel_logs' },
  timestampValueExpression: 'Timestamp',
  defaultTableSelectExpression: 'Body',
  ...extra,
});

describe('ConnectionRepository', () => {
  it('creates without exposing secrets and reads them back on request', async () => {
    const { store } = setup();
    const created = await store.connections.create(TEAM, {
      ...connectionInput,
      tlsCaCertificate: 'PEM',
      monitorPassword: 'mon-pw',
    });
    expect(created).toMatchObject({ _id: created.id, team: TEAM });
    expect(created).not.toHaveProperty('password');
    expect(created).not.toHaveProperty('tlsCaCertificate');
    expect(created).not.toHaveProperty('monitorPassword');

    expect(await store.connections.get(TEAM, created._id)).not.toHaveProperty(
      'password',
    );
    expect(
      await store.connections.get(TEAM, created._id, { secrets: true }),
    ).toMatchObject({
      password: 'secret-pw',
      tlsCaCertificate: 'PEM',
      monitorPassword: 'mon-pw',
    });
  });

  it('getWithSecrets works by id alone and honors an optional team', async () => {
    const { store } = setup();
    const { _id } = await store.connections.create(TEAM, connectionInput);
    expect((await store.connections.getWithSecrets(_id))?.password).toBe(
      'secret-pw',
    );
    expect(await store.connections.getWithSecrets(_id, TEAM)).not.toBeNull();
    expect(await store.connections.getWithSecrets(_id, OTHER_TEAM)).toBeNull();
    expect(await store.connections.getWithSecrets('not-an-id')).toBeNull();
  });

  it('isolates teams and accepts upper-case ids', async () => {
    const { store } = setup();
    const { _id } = await store.connections.create(TEAM, connectionInput);
    expect(await store.connections.get(OTHER_TEAM, _id)).toBeNull();
    expect(await store.connections.exists(OTHER_TEAM, _id)).toBe(false);
    expect(await store.connections.get(TEAM, _id.toUpperCase())).toMatchObject({
      _id,
    });
  });

  it('lists a team oldest first and counts', async () => {
    const { store, advance } = setup();
    const a = await store.connections.create(TEAM, connectionInput);
    advance(1000);
    const b = await store.connections.create(TEAM, connectionInput);
    await store.connections.create(OTHER_TEAM, connectionInput);
    expect((await store.connections.list(TEAM)).map(c => c._id)).toEqual([
      a._id,
      b._id,
    ]);
    expect(await store.connections.count(TEAM)).toBe(2);
    expect(await store.connections.count(newId())).toBe(0);
  });

  it('updates like $set/$unset: undefined skipped, team fixed, fields unset', async () => {
    const { store, advance } = setup();
    const { _id, createdAt } = await store.connections.create(TEAM, {
      ...connectionInput,
      tlsCaCertificate: 'PEM',
    });
    advance(5000);
    const updated = await store.connections.update(
      TEAM,
      _id,
      { name: 'Renamed', host: undefined },
      ['tlsCaCertificate'],
    );
    expect(updated).toMatchObject({
      name: 'Renamed',
      host: 'couchbase://localhost',
      team: TEAM,
    });
    expect(updated!.createdAt).toEqual(createdAt);
    expect(updated!.updatedAt.getTime()).toBeGreaterThan(createdAt.getTime());
    expect(
      (await store.connections.getWithSecrets(_id))?.tlsCaCertificate,
    ).toBeUndefined();
    expect(
      await store.connections.update(OTHER_TEAM, _id, { name: 'x' }),
    ).toBeNull();
  });

  it('deletes only within the team', async () => {
    const { store } = setup();
    const { _id } = await store.connections.create(TEAM, connectionInput);
    expect(await store.connections.delete(OTHER_TEAM, _id)).toBeNull();
    expect((await store.connections.delete(TEAM, _id))?._id).toBe(_id);
    expect(await store.connections.get(TEAM, _id)).toBeNull();
    expect(await store.connections.delete(TEAM, _id)).toBeNull();
  });
});

describe('SourceRepository', () => {
  it('creates, reads back, and keeps only the kind’s fields', async () => {
    const { store } = setup();
    const { _id: connection } = await store.connections.create(
      TEAM,
      connectionInput,
    );
    const created = await store.sources.create(
      TEAM,
      // metricTables belongs to metric sources; a log source drops it.
      logSource(connection, { metricTables: { gauge: 'g' }, bogus: 1 }),
    );
    expect(created).toMatchObject({
      kind: SourceKind.Log,
      team: TEAM,
      connection,
      disabled: false,
    });
    expect(sourceField(created, 'metricTables')).toBeUndefined();
    expect(sourceField(created, 'bogus')).toBeUndefined();
    expect(await store.sources.get(TEAM, created._id)).toMatchObject({
      name: 'Logs',
    });
  });

  it('rejects an unknown kind, a bad connection id, and too many query settings', async () => {
    const { store } = setup();
    const connection = newId();
    await expect(
      store.sources.create(
        TEAM,
        loose({ ...logSource(connection), kind: 'bogus' }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      store.sources.create(TEAM, logSource('nope')),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      store.sources.create(
        TEAM,
        logSource(connection, {
          querySettings: Array.from({ length: 11 }, (_, i) => ({
            setting: `s${i}`,
            value: 'v',
          })),
        }),
      ),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await store.sources.count(TEAM)).toBe(0);
  });

  it('treats an empty minAutoGranularity as unset', async () => {
    const { store } = setup();
    const created = await store.sources.create(
      TEAM,
      loose({
        kind: SourceKind.Metric,
        name: 'Metrics',
        connection: newId(),
        from: { databaseName: 'otel', tableName: '' },
        timestampValueExpression: 'TimeUnix',
        resourceAttributesExpression: 'ResourceAttributes',
        metricTables: { gauge: 'g' },
        minAutoGranularity: '',
      }),
    );
    expect(sourceField(created, 'minAutoGranularity')).toBeUndefined();
  });

  it('isolates teams and lists by connection', async () => {
    const { store } = setup();
    const c1 = newId();
    const c2 = newId();
    const a = await store.sources.create(TEAM, logSource(c1));
    await store.sources.create(TEAM, logSource(c2));
    await store.sources.create(OTHER_TEAM, logSource(c1));
    expect(await store.sources.get(OTHER_TEAM, a._id)).toBeNull();
    expect(await store.sources.count(TEAM)).toBe(2);
    expect(
      (await store.sources.listByConnection(TEAM, c1)).map(s => s._id),
    ).toEqual([a._id]);
  });

  it('replace swaps the whole document and may change kind', async () => {
    const { store, advance } = setup();
    const connection = newId();
    const created = await store.sources.create(TEAM, logSource(connection));
    advance(5000);
    const replaced = await store.sources.replace(
      TEAM,
      created._id,
      loose({
        kind: SourceKind.Trace,
        name: 'Traces',
        connection,
        from: { databaseName: 'otel', tableName: 'otel_traces' },
        timestampValueExpression: 'Timestamp',
        durationExpression: 'Duration',
        durationPrecision: 9,
        traceIdExpression: 'TraceId',
        spanIdExpression: 'SpanId',
        parentSpanIdExpression: 'ParentSpanId',
        spanNameExpression: 'SpanName',
        spanKindExpression: 'SpanKind',
      }),
    );
    expect(replaced).toMatchObject({
      _id: created._id,
      kind: SourceKind.Trace,
      name: 'Traces',
      team: TEAM,
    });
    expect(replaced!.createdAt).toEqual(created.createdAt);
    expect(replaced!.updatedAt.getTime()).toBeGreaterThan(
      created.updatedAt.getTime(),
    );
    expect(
      await store.sources.replace(
        OTHER_TEAM,
        created._id,
        logSource(connection),
      ),
    ).toBeNull();
    expect(
      await store.sources.replace(TEAM, newId(), logSource(connection)),
    ).toBeNull();
  });

  it('deletes only within the team', async () => {
    const { store } = setup();
    const created = await store.sources.create(TEAM, logSource(newId()));
    expect(await store.sources.delete(OTHER_TEAM, created._id)).toBeNull();
    expect((await store.sources.delete(TEAM, created._id))?._id).toBe(
      created._id,
    );
    expect(await store.sources.get(TEAM, created._id)).toBeNull();
  });
});
