import { connectOptions, connectWithRetry } from '@/metadata/couchbase/cluster';
import {
  isMetadataConfigured,
  loadMetadataConfig,
} from '@/metadata/couchbase/config';
import {
  MetadataConfigError,
  MetadataUnavailableError,
} from '@/metadata/errors';

const base = {
  CBT_COUCHBASE_CONNSTR: 'couchbase://cb',
  CBT_METADATA_USER: 'cbt_meta',
  CBT_METADATA_PASSWORD: 's3cret-pass',
};

describe('loadMetadataConfig', () => {
  it('falls back to the telemetry connection string and plan defaults', () => {
    expect(loadMetadataConfig(base)).toMatchObject({
      connstr: 'couchbase://cb',
      bucket: 'cbt_meta',
      scope: 'app',
      wanProfile: false,
      txDurability: 'majority',
      autoProvision: false,
      indexWaitMs: 120000,
    });
  });

  it('prefers CBT_METADATA_* overrides', () => {
    const cfg = loadMetadataConfig({
      ...base,
      CBT_METADATA_CONNSTR: 'couchbases://meta.example.com',
      CBT_METADATA_BUCKET: 'meta',
      CBT_METADATA_TX_DURABILITY: 'none',
      CBT_METADATA_AUTO_PROVISION: 'true',
    });
    expect(cfg).toMatchObject({
      connstr: 'couchbases://meta.example.com',
      bucket: 'meta',
      wanProfile: true,
      txDurability: 'none',
      autoProvision: true,
    });
  });

  it.each([
    [{ ...base, CBT_COUCHBASE_CONNSTR: undefined }, /CONNSTR/],
    [{ ...base, CBT_METADATA_USER: '' }, /CBT_METADATA_USER/],
    [{ ...base, CBT_METADATA_PASSWORD: '' }, /CBT_METADATA_PASSWORD/],
    [{ ...base, CBT_METADATA_TX_DURABILITY: 'one' }, /DURABILITY/],
    [{ ...base, CBT_METADATA_AUTO_PROVISION: 'yes' }, /AUTO_PROVISION/],
    [{ ...base, CBT_METADATA_INDEX_WAIT_MS: '-1' }, /INDEX_WAIT_MS/],
    [{ ...base, CBT_METADATA_WAN_PROFILE: 'maybe' }, /WAN_PROFILE/],
  ])('rejects bad config %#', (env, message) => {
    expect(() => loadMetadataConfig(env)).toThrow(MetadataConfigError);
    expect(() => loadMetadataConfig(env)).toThrow(message);
  });

  it('is configured only with both credentials', () => {
    expect(isMetadataConfigured(base)).toBe(true);
    expect(isMetadataConfigured({ CBT_METADATA_USER: 'u' })).toBe(false);
  });

  it('keeps transaction records in txn_meta', () => {
    const opts = connectOptions(loadMetadataConfig(base));
    expect(opts.transactions?.metadataCollection).toEqual({
      bucket: 'cbt_meta',
      scope: 'app',
      collection: 'txn_meta',
    });
  });
});

describe('connectWithRetry', () => {
  const cfg = loadMetadataConfig(base);
  const fast = { baseDelayMs: 1, maxDelayMs: 2 };
  // Only the surface connectWithRetry touches; the SDK type is far larger.
  const fakeCluster = (waitUntilReady = jest.fn().mockResolvedValue({})) =>
    ({ bucket: () => ({ waitUntilReady }) }) as never;

  it('connects on the first attempt', async () => {
    const connect = jest.fn().mockResolvedValue(fakeCluster());
    await connectWithRetry(cfg, fast, connect);
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('retries until the cluster and bucket answer', async () => {
    const onRetry = jest.fn();
    const connect = jest
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error('timeout'), {
          name: 'UnambiguousTimeoutError',
        }),
      )
      .mockResolvedValueOnce(
        fakeCluster(
          jest.fn().mockRejectedValue(
            Object.assign(new Error('no bucket'), {
              name: 'BucketNotFoundError',
            }),
          ),
        ),
      )
      .mockResolvedValueOnce(fakeCluster());
    await connectWithRetry(cfg, { ...fast, onRetry }, connect);
    expect(connect).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][0]).toBeInstanceOf(MetadataUnavailableError);
  });

  it('gives up after maxAttempts with a scrubbed error', async () => {
    const connect = jest
      .fn()
      .mockRejectedValue(new Error('auth failed for s3cret-pass'));
    await expect(
      connectWithRetry(cfg, { ...fast, maxAttempts: 2 }, connect),
    ).rejects.toThrow('auth failed for [redacted]');
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it('stops when aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(
      connectWithRetry(cfg, { signal: ac.signal }, jest.fn()),
    ).rejects.toThrow('aborted');
  });
});
