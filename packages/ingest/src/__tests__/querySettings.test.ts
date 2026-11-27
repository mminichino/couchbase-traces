import { runSetup } from '@/setup/cli';
import { SetupError } from '@/setup/errors';
import {
  ensureQuerySettings,
  managementUrl,
  type MgmtHttp,
  type MgmtRequest,
  parseCompletedSettings,
  querySettingsDryRun,
} from '@/setup/querySettings';

type Reply = { status: number; body?: unknown } | Error;

/** Fake management API: records every request, answers from `replies`. */
function recorder(replies: Reply[]) {
  const calls: MgmtRequest[] = [];
  const http: MgmtHttp = async req => {
    calls.push(req);
    const reply = replies.shift();
    if (reply == null) throw new Error(`unexpected ${req.method} ${req.url}`);
    if (reply instanceof Error) throw reply;
    return {
      status: reply.status,
      body:
        typeof reply.body === 'string'
          ? reply.body
          : JSON.stringify(reply.body ?? {}),
    };
  };
  return { calls, http };
}

const DEFAULTS = { queryCompletedThreshold: 1000, queryCompletedLimit: 4000 };

function run(
  wanted: Parameters<typeof ensureQuerySettings>[0]['wanted'],
  http: MgmtHttp,
  extra: { dryRun?: boolean; capella?: boolean } = {},
) {
  const lines: string[] = [];
  const result = ensureQuerySettings({
    mgmtUrl: 'http://cb.example:8091',
    username: 'Administrator',
    password: 'secret',
    wanted,
    dryRun: extra.dryRun ?? false,
    capella: extra.capella ?? false,
    http,
    log: line => lines.push(line),
  });
  return { result, lines };
}

describe('parseCompletedSettings', () => {
  it('treats unset and empty variables as "leave alone"', () => {
    expect(parseCompletedSettings({})).toEqual({});
    expect(
      parseCompletedSettings({
        CBT_COUCHBASE_COMPLETED_THRESHOLD_MS: '',
        CBT_COUCHBASE_COMPLETED_LIMIT: ' ',
      }),
    ).toEqual({});
  });

  it('reads integers, including 0 and -1', () => {
    expect(
      parseCompletedSettings({
        CBT_COUCHBASE_COMPLETED_THRESHOLD_MS: '0',
        CBT_COUCHBASE_COMPLETED_LIMIT: '-1',
      }),
    ).toEqual({ completedThresholdMs: 0, completedLimit: -1 });
  });

  it.each(['abc', '1.5', '1e3', '-2', '2147483648'])(
    'rejects %p with exit code 1',
    raw => {
      let caught: unknown;
      try {
        parseCompletedSettings({ CBT_COUCHBASE_COMPLETED_THRESHOLD_MS: raw });
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(SetupError);
      expect((caught as SetupError).exitCode).toBe(1);
      expect((caught as SetupError).message).toMatch(
        /CBT_COUCHBASE_COMPLETED_THRESHOLD_MS/,
      );
    },
  );
});

describe('managementUrl', () => {
  it('uses 8091, 18091 for TLS, and CBT_COUCHBASE_MGMT_PORT', () => {
    expect(managementUrl('couchbase://cb1,cb2', {})).toBe('http://cb1:8091');
    expect(managementUrl('couchbases://cb.example', {})).toBe(
      'https://cb.example:18091',
    );
    expect(
      managementUrl('couchbase://localhost:12210?network=external', {
        CBT_COUCHBASE_MGMT_PORT: '9091',
      }),
    ).toBe('http://localhost:9091');
  });

  it('rejects a bad port override', () => {
    expect(() =>
      managementUrl('couchbase://cb', { CBT_COUCHBASE_MGMT_PORT: 'x' }),
    ).toThrow(SetupError);
  });
});

describe('ensureQuerySettings', () => {
  it('makes no management call when both variables are unset', async () => {
    const { calls, http } = recorder([]);
    const { result, lines } = run({}, http);
    await expect(result).resolves.toEqual({ changed: [], skipped: 'unset' });
    expect(calls).toHaveLength(0);
    expect(lines).toEqual(['skipped query settings (unset)']);
  });

  it('writes only the keys that differ to the cluster endpoint', async () => {
    const { calls, http } = recorder([
      { status: 200, body: DEFAULTS },
      { status: 200, body: { ...DEFAULTS, queryCompletedThreshold: 0 } },
    ]);
    const { result, lines } = run(
      { completedThresholdMs: 0, completedLimit: 4000 },
      http,
    );
    await expect(result).resolves.toEqual({
      changed: ['queryCompletedThreshold'],
    });
    expect(calls.map(c => [c.method, c.url, c.body])).toEqual([
      ['GET', 'http://cb.example:8091/settings/querySettings', undefined],
      [
        'POST',
        'http://cb.example:8091/settings/querySettings',
        { queryCompletedThreshold: 0 },
      ],
    ]);
    expect(calls[0]).toMatchObject({
      username: 'Administrator',
      password: 'secret',
    });
    expect(lines).toEqual([
      'updated query settings: queryCompletedThreshold 1000 -> 0',
    ]);
  });

  it('is idempotent: same values means no write', async () => {
    const { calls, http } = recorder([
      {
        status: 200,
        body: { queryCompletedThreshold: 0, queryCompletedLimit: 4000 },
      },
    ]);
    const { result, lines } = run(
      { completedThresholdMs: 0, completedLimit: 4000 },
      http,
    );
    await expect(result).resolves.toEqual({ changed: [] });
    expect(calls.map(c => c.method)).toEqual(['GET']);
    expect(lines).toEqual(['exists query settings (no change)']);
  });

  it('dry run lists the keys it would change and never writes', async () => {
    const { calls, http } = recorder([{ status: 200, body: DEFAULTS }]);
    const { result, lines } = run(
      { completedThresholdMs: 0, completedLimit: 10000 },
      http,
      { dryRun: true },
    );
    await expect(result).resolves.toEqual({
      changed: ['queryCompletedThreshold', 'queryCompletedLimit'],
    });
    expect(calls.map(c => c.method)).toEqual(['GET']);
    expect(lines).toEqual([
      'would update query settings: queryCompletedThreshold 1000 -> 0, queryCompletedLimit 4000 -> 10000',
    ]);
  });

  it('warns and continues on 403 (no Full Admin or Cluster Admin)', async () => {
    const { http } = recorder([
      { status: 403, body: { message: 'Forbidden' } },
    ]);
    const { result, lines } = run({ completedThresholdMs: 0 }, http);
    await expect(result).resolves.toEqual({
      changed: [],
      skipped: 'forbidden',
    });
    expect(lines[0]).toMatch(/^warning: .*Full Admin or Cluster Admin/);
  });

  it('warns and continues on a 403 for the write', async () => {
    const { http } = recorder([
      { status: 200, body: DEFAULTS },
      { status: 403, body: {} },
    ]);
    await expect(
      run({ completedThresholdMs: 0 }, http).result,
    ).resolves.toEqual({ changed: [], skipped: 'forbidden' });
  });

  it('warns and continues when the management port is unreachable', async () => {
    const err = Object.assign(new Error('connect ECONNREFUSED'), {
      code: 'ECONNREFUSED',
    });
    const { http } = recorder([err]);
    const { result, lines } = run({ completedLimit: 100 }, http);
    await expect(result).resolves.toEqual({
      changed: [],
      skipped: 'unreachable',
    });
    expect(lines[0]).toMatch(/CBT_COUCHBASE_MGMT_PORT/);
  });

  it('skips Capella with a notice and no call', async () => {
    const { calls, http } = recorder([]);
    const { result, lines } = run({ completedThresholdMs: 0 }, http, {
      capella: true,
    });
    await expect(result).resolves.toEqual({ changed: [], skipped: 'capella' });
    expect(calls).toHaveLength(0);
    expect(lines[0]).toMatch(/Capella UI/);
  });

  it('reports a cluster 400 with its message (exit code 1)', async () => {
    const { http } = recorder([
      { status: 200, body: DEFAULTS },
      { status: 400, body: { errors: { queryCompletedLimit: 'bad value' } } },
    ]);
    const err = await run({ completedLimit: 5 }, http).result.catch(e => e);
    expect(err).toBeInstanceOf(SetupError);
    expect(err.exitCode).toBe(1);
    expect(err.message).toMatch(/HTTP 400 .*bad value/);
  });
});

describe('querySettingsDryRun', () => {
  it('lists the wanted keys without contacting the cluster', () => {
    const lines: string[] = [];
    querySettingsDryRun({ completedThresholdMs: 0 }, false, l => lines.push(l));
    querySettingsDryRun({}, false, l => lines.push(l));
    querySettingsDryRun({ completedLimit: 1 }, true, l => lines.push(l));
    expect(lines).toEqual([
      'would set query settings if different: queryCompletedThreshold=0',
      'skipped query settings (unset)',
      'skipped query settings (Capella)',
    ]);
  });
});

describe('runSetup with completed-requests settings', () => {
  const base = {
    // Port 1 refuses connections: reaching it would fail with exit 3 or 5.
    CBT_COUCHBASE_CONNSTR: 'couchbase://127.0.0.1:1',
    CBT_COUCHBASE_ADMIN_USER: 'Administrator',
    CBT_COUCHBASE_ADMIN_PASSWORD: 'secret',
  };

  it('exits 1 on an invalid value before contacting the cluster', async () => {
    const lines: string[] = [];
    const code = await runSetup(
      [],
      { ...base, CBT_COUCHBASE_COMPLETED_LIMIT: 'lots' },
      l => lines.push(l),
    );
    expect(code).toBe(1);
    expect(lines).toEqual(['CBT_COUCHBASE_COMPLETED_LIMIT must be an integer']);
  });

  it('prints the intended change in --dry-run', async () => {
    const lines: string[] = [];
    const code = await runSetup(
      ['--dry-run', '--no-metadata'],
      { ...base, CBT_COUCHBASE_COMPLETED_THRESHOLD_MS: '0' },
      l => lines.push(l),
    );
    expect(code).toBe(0);
    expect(lines).toContain(
      'would set query settings if different: queryCompletedThreshold=0',
    );
  });
});
