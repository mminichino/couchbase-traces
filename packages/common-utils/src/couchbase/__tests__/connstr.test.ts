import {
  ConnStrError,
  defaultWanProfile,
  isCapellaHost,
  isValidCouchbaseConnStr,
  parseConnStr,
  resolveWanProfile,
} from '@/couchbase/connstr';

describe('parseConnStr', () => {
  it('parses a single host', () => {
    expect(parseConnStr('couchbase://localhost')).toEqual({
      scheme: 'couchbase',
      hosts: [{ host: 'localhost', port: null }],
      params: {},
    });
  });

  it('parses multiple hosts with ports and a trailing slash', () => {
    expect(
      parseConnStr('couchbases://a.example.com:11207,b.example.com/'),
    ).toEqual({
      scheme: 'couchbases',
      hosts: [
        { host: 'a.example.com', port: 11207 },
        { host: 'b.example.com', port: null },
      ],
      params: {},
    });
  });

  it('parses bracketed IPv6 hosts', () => {
    expect(parseConnStr('couchbase://[::1]:11210,[fe80::1]').hosts).toEqual([
      { host: '::1', port: 11210 },
      { host: 'fe80::1', port: null },
    ]);
  });

  it('passes query parameters through', () => {
    expect(
      parseConnStr('couchbase://h?network=external&kv_timeout=2500').params,
    ).toEqual({ network: 'external', kv_timeout: '2500' });
  });

  it.each([
    ['http://localhost', /must start with/],
    ['couchbase://', /at least one host/],
    ['couchbase://a,,b', /at least one host/],
    ['couchbase://user:pass@localhost', /credentials/],
    ['couchbase://localhost/bucket', /path/],
    ['couchbase://::1', /brackets/],
    ['couchbase://host:99999', /port/],
    ['couchbase://bad_host!', /Invalid host/],
    [
      `couchbase://${Array.from({ length: 33 }, (_, i) => `h${i}`).join(',')}`,
      /32 hosts/,
    ],
  ])('rejects %s', (s, msg) => {
    expect(() => parseConnStr(s)).toThrow(ConnStrError);
    expect(() => parseConnStr(s)).toThrow(msg);
    expect(isValidCouchbaseConnStr(s)).toBe(false);
  });

  it('accepts valid strings in isValidCouchbaseConnStr', () => {
    expect(
      isValidCouchbaseConnStr('couchbases://cb.abc.cloud.couchbase.com'),
    ).toBe(true);
  });
});

describe('defaultWanProfile and isCapellaHost', () => {
  it('defaults WAN profile from the scheme', () => {
    expect(defaultWanProfile(parseConnStr('couchbases://h'))).toBe(true);
    expect(defaultWanProfile(parseConnStr('couchbase://h'))).toBe(false);
  });

  it('detects Capella hosts', () => {
    expect(
      isCapellaHost(parseConnStr('couchbases://cb.xyz.cloud.couchbase.com')),
    ).toBe(true);
    expect(isCapellaHost(parseConnStr('couchbases://cb.example.com'))).toBe(
      false,
    );
  });

  it('resolveWanProfile prefers an explicit value', () => {
    expect(resolveWanProfile('couchbases://h', false)).toBe(false);
    expect(resolveWanProfile('couchbase://h', true)).toBe(true);
    expect(resolveWanProfile('couchbases://h', undefined)).toBe(true);
    expect(resolveWanProfile('not a connstr', undefined)).toBe(false);
  });
});
