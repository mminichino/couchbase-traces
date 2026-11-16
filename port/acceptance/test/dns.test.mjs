import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  evaluateDnsQueries,
  isBlockedDnsName,
  parseCoreDnsLog,
} from '../lib/dns.mjs';

describe('CoreDNS log parser and allowlist', () => {
  it('parses CoreDNS log lines', () => {
    const log = `
[INFO] 172.28.0.10:45231 - 12345 "A IN example.com. udp 42 false 1232" NOERROR qr,rd,ra 58 0.001s
[INFO] 172.28.0.10:45232 - 12346 "AAAA IN registry-1.docker.io. udp 55 false 1232" NOERROR
`;
    const names = parseCoreDnsLog(log);
    assert.deepEqual(names, ['example.com', 'registry-1.docker.io']);
  });

  it('flags blocked names regardless of allowlist', () => {
    assert.equal(isBlockedDnsName('api.hyperdx.io'), true);
    assert.equal(isBlockedDnsName('clickhouse.cloud'), true);
    assert.equal(isBlockedDnsName('foo.clickstack.bar'), true);
    assert.equal(isBlockedDnsName('reo.dev'), true);
    const evaled = evaluateDnsQueries(
      ['api.hyperdx.io', 'app'],
      { names: ['api.hyperdx.io'] },
      ['app', 'db'],
    );
    assert.equal(evaled.ok, false);
    assert.deepEqual(evaled.blocked, ['api.hyperdx.io']);
  });

  it('allows compose services and reverse lookups', () => {
    const evaled = evaluateDnsQueries(
      ['app', 'couchbase', '1.0.28.172.in-addr.arpa'],
      { names: [] },
      ['app', 'couchbase', 'db'],
    );
    assert.equal(evaled.ok, true);
  });

  it('flags unexpected external names', () => {
    const evaled = evaluateDnsQueries(
      ['evil.example.com'],
      { names: [] },
      ['app'],
    );
    assert.equal(evaled.ok, false);
    assert.deepEqual(evaled.unexpected, ['evil.example.com']);
  });
});
