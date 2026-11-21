import { dataStoreLinks, testConnectionByKind } from '@/connection';

const mockServer = jest.fn();

jest.mock('@/api', () => ({
  hdxServer: (...args: unknown[]) => mockServer(...args),
}));

function respond(body: unknown) {
  mockServer.mockReturnValue({ json: () => Promise.resolve(body) });
}

describe('testConnectionByKind', () => {
  beforeEach(() => mockServer.mockReset());

  it('posts the connection to couchbase/test without the kind', async () => {
    respond({ success: true });
    const result = await testConnectionByKind({
      kind: 'couchbase',
      host: 'couchbases://cb.example.com',
      username: 'cbt_query',
      password: 'secret',
      wanProfile: true,
      connectionId: 'c1',
    });
    expect(result).toEqual({ success: true, error: undefined });
    expect(mockServer).toHaveBeenCalledTimes(1);
    expect(mockServer).toHaveBeenCalledWith('couchbase/test', {
      method: 'POST',
      json: {
        host: 'couchbases://cb.example.com',
        username: 'cbt_query',
        password: 'secret',
        wanProfile: true,
        connectionId: 'c1',
      },
      throwHttpErrors: false,
    });
  });

  it('returns the serialized error message on failure', async () => {
    respond({
      success: false,
      error: { message: 'authentication failure', code: 'AUTH' },
    });
    const result = await testConnectionByKind({
      kind: 'couchbase',
      host: 'couchbase://localhost',
      username: 'u',
    });
    expect(result).toEqual({
      success: false,
      error: 'authentication failure',
    });
  });

  it('never calls the removed evalstore-proxy route', async () => {
    respond({ success: true });
    await testConnectionByKind({
      kind: 'couchbase',
      host: 'couchbase://localhost',
      username: 'u',
    });
    for (const [route] of mockServer.mock.calls) {
      expect(route).not.toMatch(/evalstore/);
    }
  });
});

describe('dataStoreLinks', () => {
  it('reports Couchbase only when a couchbase connection exists', () => {
    expect(dataStoreLinks(undefined)).toEqual({ hasCouchbase: false });
    expect(dataStoreLinks([{ kind: 'clickhouse' }])).toEqual({
      hasCouchbase: false,
    });
    expect(dataStoreLinks([{ kind: 'couchbase' }])).toEqual({
      hasCouchbase: true,
    });
  });
});
