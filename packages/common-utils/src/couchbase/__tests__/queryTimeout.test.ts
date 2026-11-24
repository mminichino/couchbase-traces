// R2c: an MCP client's queryTimeoutMs is upstream's per-client
// max_execution_time. It applies only to queries that set no timeout of their
// own, and the SDK sends it as the request timeout.
import { CouchbaseNodeClient } from '@/couchbase/node';
import * as nodeExecute from '@/couchbase/nodeExecute';
import { resolveQueryOptions } from '@/couchbase/settings';

const conn = { id: 'c', host: 'couchbase://x', username: 'u', updatedAt: '' };

describe('CouchbaseNodeClient queryTimeoutMs', () => {
  const executeSpy = jest.spyOn(nodeExecute, 'executeQuery');

  beforeEach(() => {
    executeSpy.mockReset();
    executeSpy.mockImplementation(async function* () {
      yield { type: 'end', rows: 0, statistics: {} } as never;
    });
  });

  afterAll(() => executeSpy.mockRestore());

  const sentTimeout = () =>
    executeSpy.mock.calls[executeSpy.mock.calls.length - 1][0].inputs.timeoutMs;

  it('sends the client timeout when the query sets none', async () => {
    const client = new CouchbaseNodeClient({ conn, queryTimeoutMs: 30_000 });
    await client.query({ query: 'SELECT 1', connectionId: 'c' });
    expect(sentTimeout()).toBe(30_000);
  });

  it("keeps the query's own timeoutMs", async () => {
    const client = new CouchbaseNodeClient({ conn, queryTimeoutMs: 30_000 });
    await client.query({
      query: 'SELECT 1',
      connectionId: 'c',
      timeoutMs: 5_000,
    });
    expect(sentTimeout()).toBe(5_000);
  });

  it("keeps the query's own max_execution_time", async () => {
    const client = new CouchbaseNodeClient({ conn, queryTimeoutMs: 30_000 });
    await client.query({
      query: 'SELECT 1',
      connectionId: 'c',
      query_settings: { max_execution_time: 5 },
    });
    expect(sentTimeout()).toBeUndefined();
  });

  it('sends nothing extra without a client timeout', async () => {
    const client = new CouchbaseNodeClient({ conn });
    await client.query({ query: 'SELECT 1', connectionId: 'c' });
    expect(sentTimeout()).toBeUndefined();
  });

  it('wins over the source and team timeouts once resolved', () => {
    const resolved = resolveQueryOptions({
      inputs: {
        query: 'SELECT 1',
        timeoutMs: 30_000,
        sourceSettings: [{ setting: 'timeout_ms', value: '90000' }],
      },
      team: { queryTimeout: 120 } as never,
      config: { defaultTimeoutMs: 60_000, maxTimeoutMs: 600_000 },
    });
    expect(resolved.timeoutMs).toBe(30_000);
    expect(resolved.readOnly).toBe(true);
  });
});
