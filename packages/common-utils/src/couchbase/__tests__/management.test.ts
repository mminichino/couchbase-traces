import { managementBaseUrl } from '@/couchbase/management';

const base = {
  id: '65f0b0b0b0b0b0b0b0b0b0b0',
  username: 'reader',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

describe('managementBaseUrl', () => {
  it('uses http and 8091 for couchbase:// and ignores the bootstrap port', () => {
    expect(
      managementBaseUrl({
        ...base,
        host: 'couchbase://cb.example.com:11210',
      }),
    ).toEqual({ url: 'http://cb.example.com:8091' });
  });

  it('uses https and 18091 for couchbases:// and attaches the CA', () => {
    expect(
      managementBaseUrl({
        ...base,
        host: 'couchbases://cb.example.com',
        tlsCaCertificate: '-----BEGIN CERTIFICATE-----',
      }),
    ).toEqual({
      url: 'https://cb.example.com:18091',
      ca: '-----BEGIN CERTIFICATE-----',
    });
  });

  it('lets managementPort override the scheme default', () => {
    expect(
      managementBaseUrl({
        ...base,
        host: 'couchbases://cb.example.com',
        managementPort: 19091,
        tlsCaCertificate: 'pem',
      }),
    ).toEqual({ url: 'https://cb.example.com:19091', ca: 'pem' });
  });

  it('re-brackets the first IPv6 host and ignores later hosts', () => {
    expect(
      managementBaseUrl({
        ...base,
        host: 'couchbase://[2001:db8::1],cb.example.com',
      }),
    ).toEqual({ url: 'http://[2001:db8::1]:8091' });
  });
});
