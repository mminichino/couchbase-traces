// Ported from upstream clickhouse/__tests__/nodeAttribution.test.ts. The
// ClickHouse client stamped `log_comment` and `query_id`; here the same
// attribution becomes the SQL++ `clientContextId` and a trailing comment on
// the statement, which `system:completed_requests` records.
import { EventEmitter } from 'node:events';

import type { QueryOptions } from 'couchbase';

import { CouchbaseNodeClient } from '@/couchbase/node';
import type { ClusterCache } from '@/couchbase/nodeClusterCache';
import * as nodeExecute from '@/couchbase/nodeExecute';
import { executeQuery } from '@/couchbase/nodeExecute';
import {
  getCurrentQueryAttribution,
  withQueryAttribution,
} from '@/dataLayer/node';
import type { QueryAttribution } from '@/query/attribution';

type Sent = { statement: string; options: QueryOptions };

/** A cluster cache whose cluster records each query and returns no rows. */
function recordingCache(sent: Sent[]): ClusterCache {
  const cluster = {
    query(statement: string, options: QueryOptions) {
      sent.push({ statement, options });
      const emitter = new EventEmitter();
      setImmediate(() => {
        emitter.emit('meta', {});
        emitter.emit('end');
      });
      return emitter;
    },
  };
  const cache: Partial<ClusterCache> = {
    lease: async () => ({ cluster, release: () => {} }) as never,
  };
  return cache as ClusterCache;
}

const conn = {
  connectionString: 'couchbase://127.0.0.1',
  username: 'u',
  password: 'p',
};

async function run(
  inputs: { query: string; attribution?: QueryAttribution; queryId?: string },
  sent: Sent[],
) {
  for await (const _ of executeQuery({
    conn: conn as never,
    inputs,
    team: null,
    frameRows: 10,
    cache: recordingCache(sent),
  })) {
    // drain
  }
}

/** The attribution JSON carried in the trailing block comment. */
function commentOf(statement: string): Record<string, unknown> | undefined {
  const m = /\n\/\* (\{.*\}) \*\/$/.exec(statement);
  return m ? JSON.parse(m[1]) : undefined;
}

describe('withQueryAttribution', () => {
  it('exposes nothing outside a scope', () => {
    expect(getCurrentQueryAttribution()).toBeUndefined();
  });

  it('nests, with the inner scope winning on conflict', () => {
    withQueryAttribution({ surface: 'alert', label: 'outer' }, () => {
      withQueryAttribution({ alert: 'alert-1', label: 'inner' }, () => {
        expect(getCurrentQueryAttribution()).toEqual({
          surface: 'alert',
          label: 'inner',
          alert: 'alert-1',
        });
      });
      expect(getCurrentQueryAttribution()).toEqual({
        surface: 'alert',
        label: 'outer',
      });
    });
  });

  it('survives await boundaries', async () => {
    await withQueryAttribution({ surface: 'mcp', label: 'tool' }, async () => {
      await Promise.resolve();
      await new Promise(resolve => setTimeout(resolve, 1));
      expect(getCurrentQueryAttribution()?.label).toBe('tool');
    });
  });

  it('keeps concurrent scopes isolated', async () => {
    const seen = await Promise.all([
      withQueryAttribution({ surface: 'alert', alert: 'a' }, async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        return getCurrentQueryAttribution()?.alert;
      }),
      withQueryAttribution({ surface: 'alert', alert: 'b' }, async () => {
        await new Promise(resolve => setTimeout(resolve, 1));
        return getCurrentQueryAttribution()?.alert;
      }),
    ]);

    expect(seen).toEqual(['a', 'b']);
  });
});

describe('executeQuery attribution', () => {
  it('stamps a query issued inside a scope', async () => {
    const sent: Sent[] = [];
    await withQueryAttribution(
      { surface: 'alert', alert: 'alert-1' },
      async () => run({ query: 'SELECT 1' }, sent),
    );

    expect(sent).toHaveLength(1);
    expect(sent[0].statement.startsWith('SELECT 1\n/* ')).toBe(true);
    expect(commentOf(sent[0].statement)).toEqual({
      v: 1,
      surface: 'alert',
      alert: 'alert-1',
    });
    expect(sent[0].options.clientContextId).toMatch(/^hdx-alert-/);
  });

  it('lets a per-query value override the ambient scope', async () => {
    const sent: Sent[] = [];
    await withQueryAttribution({ surface: 'mcp', label: 'outer' }, async () =>
      run({ query: 'SELECT 1', attribution: { label: 'inner' } }, sent),
    );

    expect(commentOf(sent[0].statement)).toMatchObject({
      surface: 'mcp',
      label: 'inner',
    });
  });

  it('leaves the statement alone when nothing is known', async () => {
    const sent: Sent[] = [];
    await run({ query: 'SELECT 1' }, sent);

    expect(sent[0].statement).toBe('SELECT 1');
    expect(sent[0].options.clientContextId).toMatch(/^hdx-unknown-/);
  });

  it('never overrides a client context id the caller set', async () => {
    const sent: Sent[] = [];
    await withQueryAttribution({ surface: 'api' }, async () =>
      run({ query: 'SELECT 1', queryId: 'caller-id-1' }, sent),
    );

    expect(sent[0].options.clientContextId).toBe('caller-id-1');
    expect(commentOf(sent[0].statement)).toMatchObject({ surface: 'api' });
  });

  it('cannot close the comment early from an attribution value', async () => {
    const sent: Sent[] = [];
    await run(
      {
        query: 'SELECT 1',
        attribution: { surface: 'search', label: 'x */ DELETE FROM b /*' },
      },
      sent,
    );

    const tail = sent[0].statement.slice('SELECT 1'.length);
    expect(tail.indexOf('*/')).toBe(tail.length - 2);
    expect(commentOf(sent[0].statement)?.label).toBe('x / DELETE FROM b /');
  });
});

describe('CouchbaseNodeClient attribution precedence', () => {
  // The client hands the merged attribution to executeQuery, which reaches
  // the network; capture it at the module boundary instead.
  const executeSpy = jest.spyOn(nodeExecute, 'executeQuery');

  beforeEach(() => {
    executeSpy.mockImplementation(async function* () {
      yield { type: 'end', rows: 0, statistics: {} } as never;
    });
  });

  afterAll(() => executeSpy.mockRestore());

  const lastInputs = () =>
    executeSpy.mock.calls[executeSpy.mock.calls.length - 1][0].inputs;

  const newClient = (attribution?: QueryAttribution) =>
    new CouchbaseNodeClient({ conn: conn as never, attribution });

  it('stamps a query issued inside a scope', async () => {
    const client = newClient();
    await withQueryAttribution(
      { surface: 'alert', alert: 'alert-1' },
      async () => {
        await client.query({ query: 'SELECT 1', connectionId: 'c' });
      },
    );

    expect(lastInputs().attribution).toMatchObject({
      surface: 'alert',
      alert: 'alert-1',
    });
    expect(lastInputs().queryId).toMatch(/^hdx-alert-/);
  });

  it('lets the request scope override the client default', async () => {
    const client = newClient({ surface: 'api', label: 'default' });
    await withQueryAttribution({ label: 'scoped' }, async () => {
      await client.query({ query: 'SELECT 1', connectionId: 'c' });
    });

    expect(lastInputs().attribution).toMatchObject({
      surface: 'api',
      label: 'scoped',
    });
  });

  it('lets a per-query value override the ambient scope', async () => {
    const client = newClient();
    await withQueryAttribution({ surface: 'mcp', label: 'outer' }, async () => {
      await client.query({
        query: 'SELECT 1',
        connectionId: 'c',
        attribution: { label: 'inner' },
      });
    });

    expect(lastInputs().attribution).toMatchObject({
      surface: 'mcp',
      label: 'inner',
    });
  });

  it('falls back to the client default outside any scope', async () => {
    const client = newClient({ surface: 'api' });
    await client.query({ query: 'SELECT 1', connectionId: 'c' });

    expect(lastInputs().attribution).toMatchObject({ surface: 'api' });
  });
});
