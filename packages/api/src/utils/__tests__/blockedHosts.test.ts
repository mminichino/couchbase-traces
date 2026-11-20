import {
  blockedBy,
  buildBlockedHosts,
  COUCHBASE_SERVICE_PORTS,
} from '@/utils/blockedHosts';

const check = (env: Record<string, string | undefined>, url: string) =>
  blockedBy(buildBlockedHosts(env), new URL(url));

describe('buildBlockedHosts', () => {
  it('blocks every Couchbase service port on every connection-string node', () => {
    const env = {
      CBT_METADATA_CONNSTR: 'couchbases://cb1.internal,cb2.internal:11207',
    };
    for (const host of ['cb1.internal', 'cb2.internal']) {
      for (const port of COUCHBASE_SERVICE_PORTS) {
        const scheme = port >= 18000 ? 'https' : 'http';
        expect(check(env, `${scheme}://${host}:${port}/`)).toBe(
          'CBT_METADATA_CONNSTR',
        );
      }
    }
  });

  it('blocks a non-default port written in the connection string', () => {
    const env = { CBT_COUCHBASE_CONNSTR: 'couchbase://cb.internal:12000' };
    expect(check(env, 'http://cb.internal:12000/')).toBe(
      'CBT_COUCHBASE_CONNSTR',
    );
  });

  it('leaves other ports on a data-store host open', () => {
    const env = { CBT_COUCHBASE_CONNSTR: 'couchbase://localhost' };
    expect(check(env, 'http://localhost:9000/hook')).toBeUndefined();
    expect(check(env, 'http://localhost/hook')).toBeUndefined();
  });

  it('normalizes case, IPv6 brackets, and a trailing root dot', () => {
    expect(
      check(
        { CBT_COUCHBASE_CONNSTR: 'couchbase://CB.Internal.' },
        'http://cb.internal.:8091/',
      ),
    ).toBe('CBT_COUCHBASE_CONNSTR');
    expect(
      check(
        { CBT_COUCHBASE_CONNSTR: 'couchbase://[fd00::5]' },
        'http://[fd00::5]:8093/',
      ),
    ).toBe('CBT_COUCHBASE_CONNSTR');
  });

  it('reads hosts from DEFAULT_CONNECTIONS and skips malformed entries', () => {
    const env = {
      DEFAULT_CONNECTIONS: JSON.stringify([
        { name: 'a', host: 'couchbase://telemetry.internal' },
        { name: 'b' },
        null,
        { name: 'c', host: 'not a connstr' },
      ]),
    };
    expect(check(env, 'http://telemetry.internal:8093/')).toBe(
      'DEFAULT_CONNECTIONS',
    );
  });

  it.each([
    ['not JSON', '{'],
    ['not an array', '{"host":"couchbase://x"}'],
  ])('ignores DEFAULT_CONNECTIONS that is %s', (_d, raw) => {
    expect(buildBlockedHosts({ DEFAULT_CONNECTIONS: raw }).size).toBe(0);
  });

  it('blocks the collector endpoint on its exact host and port', () => {
    const env = { OTEL_EXPORTER_OTLP_ENDPOINT: 'http://otel-collector:4318' };
    expect(check(env, 'http://otel-collector:4318/v1/logs')).toBe(
      'OTEL_EXPORTER_OTLP_ENDPOINT',
    );
    expect(check(env, 'http://otel-collector:13133/')).toBeUndefined();
  });

  it('ignores unset and invalid settings', () => {
    const blocked = buildBlockedHosts({
      CBT_METADATA_CONNSTR: '',
      CBT_COUCHBASE_CONNSTR: 'http://not-couchbase',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'not a url',
    });
    expect(blocked.size).toBe(0);
  });

  it('keeps the first setting that names a host', () => {
    const env = {
      CBT_METADATA_CONNSTR: 'couchbase://cb.internal',
      CBT_COUCHBASE_CONNSTR: 'couchbase://cb.internal',
    };
    expect(check(env, 'http://cb.internal:8091/')).toBe('CBT_METADATA_CONNSTR');
  });
});
