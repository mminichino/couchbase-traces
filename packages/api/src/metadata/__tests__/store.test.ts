import type { MetadataConfig } from '@/metadata/couchbase/config';
import { loadMetadataConfig } from '@/metadata/couchbase/config';
import { CouchbaseMetadataStore } from '@/metadata/couchbase/store';
import { describeVerify } from '@/metadata/couchbase/verify';
import {
  CasConflictError,
  DuplicateKeyError,
  fromCouchbaseError,
  IndexNotReadyError,
  MetadataError,
  MetadataUnavailableError,
  NotFoundError,
  SchemaVersionError,
} from '@/metadata/errors';
import {
  getMetadataStore,
  isMetadataReady,
  metadataReadiness,
  setMetadataStoreForTests,
  startMetadataStore,
} from '@/metadata/index';
import { toWire } from '@/metadata/serialize';
import { createMemoryStore } from '@/metadata/testing/memoryStore';

jest.mock('@/metadata/couchbase/kv', () => {
  const { MemoryKv } = jest.requireActual('@/metadata/testing/memoryKv');
  const shared = new MemoryKv();
  return { CouchbaseKv: jest.fn(() => shared), __shared: shared };
});

const cfg: MetadataConfig = loadMetadataConfig({
  CBT_COUCHBASE_CONNSTR: 'couchbase://cb',
  CBT_METADATA_USER: 'u',
  CBT_METADATA_PASSWORD: 'p',
});
const ok = { ok: true, missing: [], building: [] };
const sharedKv = () => jest.requireMock('@/metadata/couchbase/kv').__shared;
const fakeCluster = { close: jest.fn().mockResolvedValue(undefined) };

function store(deps: Record<string, unknown> = {}) {
  return new CouchbaseMetadataStore(cfg, {
    connect: jest.fn().mockResolvedValue(fakeCluster),
    verify: jest.fn().mockResolvedValue(ok),
    probe: jest.fn().mockResolvedValue(undefined),
    pollMs: 5,
    ...deps,
  });
}

describe('CouchbaseMetadataStore', () => {
  beforeEach(() => sharedKv().clear());

  it('is unusable before start and ready after', async () => {
    const s = store();
    expect(() => s.kv).toThrow(MetadataUnavailableError);
    expect(s.readiness().state).toBe('connecting');
    await s.start();
    expect(s.readiness()).toEqual({ ready: true, state: 'ready' });
    await s.close();
    expect(s.readiness().state).toBe('closed');
    expect(fakeCluster.close).toHaveBeenCalled();
  });

  it('refuses a bucket written by a newer release', async () => {
    await sharedKv().insert('system', 'meta::schema', { schemaVersion: 99 });
    await expect(store().start()).rejects.toBeInstanceOf(SchemaVersionError);
  });

  it('reports missing keyspace objects, then recovers', async () => {
    const verify = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, missing: ['index ix'], building: [] })
      .mockResolvedValue(ok);
    const s = store({ verify });
    await s.start();
    expect(s.readiness()).toEqual({
      ready: false,
      state: 'provisioning',
      detail: ['missing index ix'],
    });
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(s.readiness().ready).toBe(true);
    await s.close();
  });

  it('is degraded when the transaction probe fails', async () => {
    const probe = jest
      .fn()
      .mockRejectedValue(new Error('DurabilityImpossible'));
    const s = store({ probe });
    await s.start();
    expect(s.readiness()).toMatchObject({
      ready: false,
      state: 'degraded',
      detail: ['DurabilityImpossible'],
    });
    await s.close();
  });
});

describe('metadata index', () => {
  afterEach(() => setMetadataStoreForTests(null));

  it('fails fast without credentials and holds back /ready', async () => {
    await expect(
      startMetadataStore({ env: { CBT_COUCHBASE_CONNSTR: 'couchbase://cb' } }),
    ).rejects.toThrow('CBT_METADATA_USER is required');
    expect(metadataReadiness()).toEqual({ ready: false, state: 'disabled' });
    expect(isMetadataReady()).toBe(false);
    expect(() => getMetadataStore()).toThrow(MetadataUnavailableError);
  });

  it('uses the store set for tests', () => {
    const memory = createMemoryStore();
    setMetadataStoreForTests(memory);
    expect(getMetadataStore()).toBe(memory);
    expect(isMetadataReady()).toBe(true);
  });
});

describe('fromCouchbaseError', () => {
  const sdk = (name: string, extra: object = {}) =>
    Object.assign(new Error(`${name} at couchbase://user:pw@host`), {
      name,
      ...extra,
    });

  it.each([
    ['DocumentExistsError', DuplicateKeyError],
    ['DocumentNotFoundError', NotFoundError],
    ['CasMismatchError', CasConflictError],
    ['IndexNotFoundError', IndexNotReadyError],
    ['UnambiguousTimeoutError', MetadataUnavailableError],
    ['SomethingElse', MetadataError],
  ])('maps %s', (name, cls) => {
    expect(fromCouchbaseError(sdk(name))).toBeInstanceOf(cls);
  });

  it('maps index-missing query errors by server code', () => {
    const err = sdk('PlanningFailureError', {
      context: { first_error_code: 12004 },
    });
    expect(fromCouchbaseError(err)).toBeInstanceOf(IndexNotReadyError);
  });

  it('scrubs connection strings and secrets', () => {
    const mapped = fromCouchbaseError(
      new Error('bad pw hunter2 couchbase://x'),
      {
        secrets: ['hunter2'],
      },
    );
    expect(mapped.message).not.toContain('hunter2');
    expect(mapped.message).not.toContain('couchbase://x');
  });

  it('passes metadata errors through', () => {
    const err = new NotFoundError('x');
    expect(fromCouchbaseError(err)).toBe(err);
  });
});

describe('toWire', () => {
  it('adds _id, the id virtual, and strips __v and secrets', () => {
    expect(
      toWire(
        '68dd82484f54641b08667897',
        { name: 'c', password: 'x', __v: 0, note: undefined },
        { withIdVirtual: true, secrets: ['password'] },
      ),
    ).toEqual({
      _id: '68dd82484f54641b08667897',
      id: '68dd82484f54641b08667897',
      name: 'c',
    });
  });

  it('omits id for entities without the virtual', () => {
    expect(toWire('k', { name: 'w' }, { withIdVirtual: false })).toEqual({
      _id: 'k',
      name: 'w',
    });
  });
});

describe('describeVerify', () => {
  it('lists missing and building items', () => {
    expect(
      describeVerify({ ok: false, missing: ['scope app'], building: ['ix'] }),
    ).toEqual(['missing scope app', 'building index ix']);
  });
});
