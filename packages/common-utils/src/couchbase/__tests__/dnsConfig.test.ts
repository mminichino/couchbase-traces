import { DEFAULT_DNS_SRV_TIMEOUT_MS, dnsConfig } from '@/couchbase/dnsConfig';

describe('dnsConfig (D18)', () => {
  it('defaults to 2 s, above the SDK 500 ms', () => {
    expect(DEFAULT_DNS_SRV_TIMEOUT_MS).toBe(2000);
    expect(dnsConfig({})).toEqual({ dnsSrvTimeout: 2000 });
  });

  it('reads CBT_COUCHBASE_DNS_SRV_TIMEOUT_MS', () => {
    expect(dnsConfig({ CBT_COUCHBASE_DNS_SRV_TIMEOUT_MS: '5000' })).toEqual({
      dnsSrvTimeout: 5000,
    });
  });

  it.each(['', '0', '-1', '1.5', 'abc'])(
    'falls back to the default for %p',
    raw => {
      expect(dnsConfig({ CBT_COUCHBASE_DNS_SRV_TIMEOUT_MS: raw })).toEqual({
        dnsSrvTimeout: 2000,
      });
    },
  );

  it('reads process.env at call time', () => {
    const prev = process.env.CBT_COUCHBASE_DNS_SRV_TIMEOUT_MS;
    process.env.CBT_COUCHBASE_DNS_SRV_TIMEOUT_MS = '3000';
    try {
      expect(dnsConfig().dnsSrvTimeout).toBe(3000);
    } finally {
      if (prev == null) delete process.env.CBT_COUCHBASE_DNS_SRV_TIMEOUT_MS;
      else process.env.CBT_COUCHBASE_DNS_SRV_TIMEOUT_MS = prev;
    }
  });
});
