import {
  clearConnectionKindCache,
  primeConnectionKind,
  resetConnectionKindState,
  resolveConnectionKind,
  setConnectionKindResolver,
} from '@/dataLayer/kind';

beforeEach(() => {
  resetConnectionKindState();
});

describe('connection kind', () => {
  it('defaults to clickhouse when there is no resolver or id', async () => {
    expect(await resolveConnectionKind(undefined)).toBe('clickhouse');
    expect(await resolveConnectionKind('missing')).toBe('clickhouse');
  });

  it('caches a lookup and shares one promise for concurrent callers', async () => {
    let calls = 0;
    let release: (kind: 'couchbase') => void = () => undefined;
    const gate = new Promise<'couchbase'>(resolve => {
      release = resolve;
    });
    setConnectionKindResolver(async () => {
      calls += 1;
      return gate;
    });
    const first = resolveConnectionKind('c1');
    const second = resolveConnectionKind('c1');
    release('couchbase');
    expect(await first).toBe('couchbase');
    expect(await second).toBe('couchbase');
    expect(calls).toBe(1);
    expect(await resolveConnectionKind('c1')).toBe('couchbase');
    expect(calls).toBe(1);
  });

  it('does not cache a resolver error and warns once', async () => {
    const warn = jest
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);
    let fail = true;
    setConnectionKindResolver(async () => {
      if (fail) throw new Error('down');
      return 'couchbase';
    });
    expect(await resolveConnectionKind('c2')).toBe('clickhouse');
    expect(await resolveConnectionKind('c2')).toBe('clickhouse');
    expect(warn).toHaveBeenCalledTimes(1);
    fail = false;
    expect(await resolveConnectionKind('c2')).toBe('couchbase');
    warn.mockRestore();
  });

  it('treats an undefined resolver result as clickhouse and can be cleared', async () => {
    setConnectionKindResolver(async () => undefined);
    expect(await resolveConnectionKind('c3')).toBe('clickhouse');
    clearConnectionKindCache('c3');
    primeConnectionKind('c3', 'couchbase');
    expect(await resolveConnectionKind('c3')).toBe('couchbase');
    clearConnectionKindCache();
    expect(await resolveConnectionKind('c3')).toBe('clickhouse');
  });
});
