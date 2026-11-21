import { intentionalSkipNotice, liveMode, probeLive } from './liveCluster';

describe('liveMode', () => {
  it('maps CBT_TEST_COUCHBASE_REQUIRED to required, off, or probe', () => {
    expect(liveMode('1')).toBe('required');
    expect(liveMode('0')).toBe('off');
    expect(liveMode(undefined)).toBe('probe');
    expect(liveMode('')).toBe('probe');
  });
});

describe('probeLive', () => {
  it('skips without connecting and logs where the suite runs when off', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    // An unroutable host: reaching it would time out the test.
    const conn = {
      id: 'x',
      host: 'couchbase://192.0.2.1',
      username: 'u',
      password: 'p',
      wanProfile: false,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    await expect(probeLive(conn, 'My suite', 'off')).resolves.toBe(false);
    expect(log).toHaveBeenCalledWith(intentionalSkipNotice('My suite'));
    expect(intentionalSkipNotice('My suite')).toMatch(
      /^My suite: skipped on purpose \(CBT_TEST_COUCHBASE_REQUIRED=0\); it runs in port\/couchbase-test\/run\.sh\.$/,
    );
    expect(warn).not.toHaveBeenCalled();
    log.mockRestore();
    warn.mockRestore();
  });
});
