import { CouchbaseQueryError } from '@/couchbase/errors';
import {
  buildClientContextId,
  resolveQueryOptions,
  validateSourceSettings,
} from '@/couchbase/settings';

const config = { defaultTimeoutMs: 60000, maxTimeoutMs: 600000 };

function resolve(
  inputs: Record<string, unknown>,
  team: Record<string, unknown> | null = null,
  logger?: any,
) {
  return resolveQueryOptions({
    inputs: { query: 'SELECT 1', ...inputs },
    team,
    config,
    logger,
  });
}

describe('resolveQueryOptions timeout', () => {
  it('uses the first positive value in precedence order', () => {
    const settings = [{ setting: 'timeout_ms', value: '3000' }];
    const ch = { max_execution_time: 2 };
    const team = { queryTimeout: 4 };
    expect(
      resolve(
        { timeoutMs: 1000, clickhouse_settings: ch, sourceSettings: settings },
        team,
      ).timeoutMs,
    ).toBe(1000);
    expect(
      resolve({ clickhouse_settings: ch, sourceSettings: settings }, team)
        .timeoutMs,
    ).toBe(2000);
    expect(resolve({ sourceSettings: settings }, team).timeoutMs).toBe(3000);
    expect(resolve({}, team).timeoutMs).toBe(4000);
    expect(resolve({}).timeoutMs).toBe(60000);
  });

  it('ignores values ≤ 0 and caps at maxTimeoutMs', () => {
    expect(
      resolve(
        { timeoutMs: 0, clickhouse_settings: { max_execution_time: -1 } },
        { queryTimeout: 0 },
      ).timeoutMs,
    ).toBe(60000);
    expect(resolve({ timeoutMs: 10_000_000 }).timeoutMs).toBe(600000);
  });
});

describe('resolveQueryOptions other options', () => {
  it('defaults scan consistency and readOnly', () => {
    const o = resolve({});
    expect(o.scanConsistency).toBe('not_bounded');
    expect(o.readOnly).toBe(true);
    expect(o.queryContext).toBeUndefined();
  });

  it('INFER is not read-only', () => {
    expect(resolve({ query: 'INFER `b`' }).readOnly).toBe(false);
  });

  it('reads source settings and query context', () => {
    const o = resolve({
      sourceSettings: [
        { setting: 'scan_consistency', value: 'request_plus' },
        { setting: 'max_parallelism', value: '4' },
        { setting: 'scan_cap', value: '10' },
        { setting: 'pipeline_batch', value: '16' },
        { setting: 'pipeline_cap', value: '512' },
      ],
      queryContext: { bucket: 'test', scope: 'app' },
    });
    expect(o).toMatchObject({
      scanConsistency: 'request_plus',
      maxParallelism: 4,
      scanCap: 10,
      pipelineBatch: 16,
      pipelineCap: 512,
      queryContext: 'default:`test`.`app`',
    });
  });

  it('inputs scan consistency wins over the source setting', () => {
    expect(
      resolve({
        scanConsistency: 'not_bounded',
        sourceSettings: [
          { setting: 'scan_consistency', value: 'request_plus' },
        ],
      }).scanConsistency,
    ).toBe('not_bounded');
  });

  it('throws PARSING_FAILED for invalid source settings', () => {
    expect(() =>
      resolve({ sourceSettings: [{ setting: 'max_threads', value: '1' }] }),
    ).toThrow(CouchbaseQueryError);
  });

  it('logs ignored ClickHouse settings once per key', () => {
    const logger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
    resolve(
      {
        clickhouse_settings: { some_unique_setting: 1, max_execution_time: 1 },
      },
      null,
      logger,
    );
    resolve({ clickhouse_settings: { some_unique_setting: 1 } }, null, logger);
    expect(logger.debug).toHaveBeenCalledTimes(1);
  });
});

describe('validateSourceSettings', () => {
  it.each([
    [[{ setting: 'scan_consistency', value: 'request_plus' }], null],
    [[{ setting: 'timeout_ms', value: '100' }], null],
    [undefined, null],
    [[{ setting: 'nope', value: '1' }], /Unsupported/],
    [[{ setting: 'scan_consistency', value: 'at_plus' }], /scan_consistency/],
    [[{ setting: 'scan_cap', value: '0' }], /positive integer/],
    [[{ setting: 'pipeline_cap', value: '1.5' }], /positive integer/],
  ])('%j', (settings, expected) => {
    const result = validateSourceSettings(settings as never);
    if (expected == null) expect(result).toBeNull();
    else expect(result).toMatch(expected);
  });
});

describe('buildClientContextId', () => {
  it('uses queryId when given, truncated to 64', () => {
    expect(buildClientContextId('abc', undefined)).toBe('abc');
    expect(buildClientContextId('x'.repeat(100), undefined)).toHaveLength(64);
  });

  it('builds cbt:<source|adhoc>:<12 hex>', () => {
    expect(buildClientContextId(undefined, undefined)).toMatch(
      /^cbt:adhoc:[0-9a-f]{12}$/,
    );
    expect(buildClientContextId(undefined, { source: 'src1' })).toMatch(
      /^cbt:src1:[0-9a-f]{12}$/,
    );
    expect(
      buildClientContextId(undefined, { source: 's'.repeat(80) }),
    ).toHaveLength(64);
  });
});
