// Use mutable object so individual tests can flip flags. The values here are
// the defaults used by every test unless explicitly overridden.
const configState = {
  IS_ALL_IN_ONE_IMAGE: false,
  IS_LOCAL_APP_MODE: false,
  IS_DEV: false,
  INGESTION_API_KEY: '' as string,
  IS_PROMQL_ENABLED: false,
  ENABLE_DATADOG_RECEIVER: false,
  COUCHBASE_INGEST_ENABLED: false,
};

jest.mock('@/config', () => ({
  get IS_ALL_IN_ONE_IMAGE() {
    return configState.IS_ALL_IN_ONE_IMAGE;
  },
  get IS_LOCAL_APP_MODE() {
    return configState.IS_LOCAL_APP_MODE;
  },
  get IS_DEV() {
    return configState.IS_DEV;
  },
  get INGESTION_API_KEY() {
    return configState.INGESTION_API_KEY;
  },
  get IS_PROMQL_ENABLED() {
    return configState.IS_PROMQL_ENABLED;
  },
  get ENABLE_DATADOG_RECEIVER() {
    return configState.ENABLE_DATADOG_RECEIVER;
  },
  get COUCHBASE_INGEST_ENABLED() {
    return configState.COUCHBASE_INGEST_ENABLED;
  },
}));

import {
  bearerTokenVariants,
  buildOtelCollectorConfig,
} from '@/opamp/controllers/opampController';

const resetConfig = () => {
  configState.IS_ALL_IN_ONE_IMAGE = false;
  configState.IS_LOCAL_APP_MODE = false;
  configState.IS_DEV = false;
  configState.INGESTION_API_KEY = '';
  configState.IS_PROMQL_ENABLED = false;
  configState.ENABLE_DATADOG_RECEIVER = false;
  configState.COUCHBASE_INGEST_ENABLED = false;
};

describe('opampController', () => {
  beforeEach(() => {
    resetConfig();
  });

  describe('buildOtelCollectorConfig ClickHouse exporters', () => {
    it('allows both exporter timeouts to be configured from the collector environment', () => {
      const cfg = buildOtelCollectorConfig([]);

      expect(cfg.exporters).toMatchObject({
        clickhouse: {
          timeout: '${env:CBT_OTEL_EXPORTER_TIMEOUT:-5s}',
        },
        'clickhouse/rrweb': {
          timeout: '${env:CBT_OTEL_EXPORTER_TIMEOUT:-5s}',
        },
      });
    });
  });

  describe('buildOtelCollectorConfig prometheus receiver', () => {
    it('scrapes ClickHouse in its own job so the scheme follows the endpoint', () => {
      const cfg = buildOtelCollectorConfig([
        { apiKey: 'k1', collectorAuthenticationEnforced: false },
      ]);

      const scrapeConfigs = cfg.receivers.prometheus?.config.scrape_configs;
      // The collector's own endpoint is always plain HTTP: no scheme here.
      expect(scrapeConfigs?.[0]).toEqual({
        job_name: 'otelcol',
        scrape_interval: '30s',
        static_configs: [{ targets: ['0.0.0.0:8888'] }],
      });
      // The default keeps collector images that predate
      // CBT_PROMETHEUS_SCHEME on plain HTTP.
      expect(scrapeConfigs?.[1]).toEqual({
        job_name: 'clickhouse',
        scrape_interval: '30s',
        scheme: '${env:CBT_PROMETHEUS_SCHEME:-http}',
        static_configs: [
          { targets: ['${env:CLICKHOUSE_PROMETHEUS_METRICS_ENDPOINT}'] },
        ],
      });
    });
  });

  describe('buildOtelCollectorConfig otlp/hyperdx CORS', () => {
    it('lets browsers cache preflights for 10 minutes', () => {
      const cfg = buildOtelCollectorConfig([]);

      expect(cfg.receivers['otlp/hyperdx']?.protocols.http.cors).toEqual({
        allowed_origins: ['*'],
        allowed_headers: ['*'],
        max_age: 600,
      });
    });
  });

  describe('buildOtelCollectorConfig otlp/hyperdx authentication', () => {
    it('accepts bare and bearer-prefixed authorization values for each API key', () => {
      const cfg = buildOtelCollectorConfig([
        { apiKey: 'k1', collectorAuthenticationEnforced: true },
        { apiKey: 'k2', collectorAuthenticationEnforced: true },
      ]);

      // The extension matches the full header value exactly, so every
      // accepted form must be listed explicitly (see bearerTokenVariants).
      expect(cfg.extensions['bearertokenauth/hyperdx']).toEqual({
        scheme: '',
        tokens: [
          'k1',
          'Bearer k1',
          'bearer k1',
          'BEARER k1',
          'k2',
          'Bearer k2',
          'bearer k2',
          'BEARER k2',
        ],
      });
      expect(cfg.receivers['otlp/hyperdx']?.protocols.grpc.auth).toEqual({
        authenticator: 'bearertokenauth/hyperdx',
      });
      expect(cfg.receivers['otlp/hyperdx']?.protocols.http.auth).toEqual({
        authenticator: 'bearertokenauth/hyperdx',
      });
    });

    it('includes variants for INGESTION_API_KEY in all-in-one mode', () => {
      configState.IS_ALL_IN_ONE_IMAGE = true;
      configState.INGESTION_API_KEY = 'ingest-key';

      const cfg = buildOtelCollectorConfig([
        { apiKey: 'k1', collectorAuthenticationEnforced: true },
      ]);

      const tokens = cfg.extensions['bearertokenauth/hyperdx'].tokens;
      expect(tokens).toEqual(
        expect.arrayContaining([
          'ingest-key',
          'Bearer ingest-key',
          'bearer ingest-key',
          'BEARER ingest-key',
        ]),
      );
    });

    it('bearerTokenVariants emits the bare token plus the bearer scheme case variants', () => {
      expect(bearerTokenVariants(['tok'])).toEqual([
        'tok',
        'Bearer tok',
        'bearer tok',
        'BEARER tok',
      ]);
    });
  });

  describe('buildOtelCollectorConfig datadog receiver', () => {
    it('omits the datadog receiver when the flag is off (default)', () => {
      configState.ENABLE_DATADOG_RECEIVER = false;

      const cfg = buildOtelCollectorConfig([]);

      expect(cfg.receivers.datadog).toBeUndefined();
      expect(cfg.service.pipelines.traces.receivers).not.toContain('datadog');
      expect(cfg.service.pipelines.metrics.receivers).not.toContain('datadog');
      expect(cfg.service.pipelines['logs/in'].receivers).not.toContain(
        'datadog',
      );
    });

    it('attaches the datadog receiver to the traces, metrics, and logs pipelines when the flag is on', () => {
      configState.ENABLE_DATADOG_RECEIVER = true;

      const cfg = buildOtelCollectorConfig([]);

      expect(cfg.receivers.datadog).toMatchObject({
        endpoint: '0.0.0.0:8126',
        read_timeout: '60s',
      });
      // The single DD receiver serves all three signals; attach it to each.
      expect(cfg.service.pipelines.traces.receivers).toContain('datadog');
      expect(cfg.service.pipelines.metrics.receivers).toContain('datadog');
      expect(cfg.service.pipelines['logs/in'].receivers).toContain('datadog');
    });

    it('leaves the datadog receiver unauthenticated when no team API keys exist', () => {
      configState.ENABLE_DATADOG_RECEIVER = true;

      const cfg = buildOtelCollectorConfig([]);

      // No API keys -> no auth wiring, mirroring otlp/hyperdx.
      expect(cfg.receivers.datadog?.auth).toBeUndefined();
      expect(cfg.extensions['bearertokenauth/datadog']).toBeUndefined();
      expect(cfg.service.extensions).not.toContain('bearertokenauth/datadog');
    });

    it('leaves the datadog receiver unauthenticated when collector authentication is not enforced', () => {
      configState.ENABLE_DATADOG_RECEIVER = true;

      const cfg = buildOtelCollectorConfig([
        { apiKey: 'k1', collectorAuthenticationEnforced: false },
      ]);

      // Keys exist but auth is not enforced -> no auth wiring, mirroring
      // otlp/hyperdx.
      expect(cfg.receivers.datadog?.auth).toBeUndefined();
      expect(cfg.extensions['bearertokenauth/datadog']).toBeUndefined();
      expect(cfg.service.extensions).not.toContain('bearertokenauth/datadog');
    });

    it('authenticates the datadog receiver with team API keys via the DD-API-KEY header', () => {
      configState.ENABLE_DATADOG_RECEIVER = true;

      const cfg = buildOtelCollectorConfig([
        { apiKey: 'k1', collectorAuthenticationEnforced: true },
        { apiKey: 'k2', collectorAuthenticationEnforced: true },
      ]);

      // Bearer-token extension keyed on DD-API-KEY with the team API keys.
      expect(cfg.extensions['bearertokenauth/datadog']).toEqual({
        header: 'DD-API-KEY',
        scheme: '',
        tokens: ['k1', 'k2'],
      });
      // Receiver references the authenticator and the extension is enabled.
      expect(cfg.receivers.datadog?.auth).toEqual({
        authenticator: 'bearertokenauth/datadog',
      });
      expect(cfg.service.extensions).toContain('bearertokenauth/datadog');
      // The otlp/hyperdx auth extension stays intact alongside it.
      expect(cfg.service.extensions).toContain('bearertokenauth/hyperdx');
    });
  });

  describe('buildOtelCollectorConfig Couchbase ingest', () => {
    it('leaves the config unchanged when the flag is off', () => {
      const off = buildOtelCollectorConfig([]);
      expect(JSON.stringify(off)).not.toContain('otlphttp/couchbase');
      expect(off.service.pipelines.traces.exporters).toEqual(['clickhouse']);
      expect(off.service.pipelines.metrics.exporters).toEqual(['clickhouse']);
      expect(off.service.pipelines['logs/out-default'].exporters).toEqual([
        'clickhouse',
      ]);
      expect(off.service.pipelines['logs/out-rrweb'].exporters).toEqual([
        'clickhouse/rrweb',
      ]);
      expect(off.service.pipelines['metrics/promql']).toBeUndefined();
    });

    it('appends the Couchbase exporters without removing ClickHouse', () => {
      configState.COUCHBASE_INGEST_ENABLED = true;
      const cfg = buildOtelCollectorConfig([
        { apiKey: 'k1', collectorAuthenticationEnforced: false },
      ]);
      expect(cfg.exporters?.['otlphttp/couchbase']).toEqual({
        endpoint: '${env:CBT_INGEST_ENDPOINT}',
        encoding: 'json',
        compression: 'gzip',
        headers: { Authorization: 'Bearer ${env:CBT_INGEST_TOKEN}' },
        timeout: '30s',
        retry_on_failure: {
          enabled: true,
          initial_interval: '5s',
          max_interval: '30s',
          max_elapsed_time: '300s',
        },
        sending_queue: { enabled: true, num_consumers: 4, queue_size: 1000 },
      });
      expect(cfg.exporters?.['otlphttp/couchbase-rrweb']).toMatchObject({
        logs_endpoint: '${env:CBT_INGEST_ENDPOINT}/v1/sessions',
        encoding: 'json',
      });
      expect(cfg.service.pipelines.traces.exporters).toEqual([
        'clickhouse',
        'otlphttp/couchbase',
      ]);
      expect(cfg.service.pipelines.metrics.exporters).toEqual([
        'clickhouse',
        'otlphttp/couchbase',
      ]);
      expect(cfg.service.pipelines['logs/out-default'].exporters).toEqual([
        'clickhouse',
        'otlphttp/couchbase',
      ]);
      expect(cfg.service.pipelines['logs/out-rrweb'].exporters).toEqual([
        'clickhouse/rrweb',
        'otlphttp/couchbase-rrweb',
      ]);
      expect(cfg.service.pipelines['metrics/promql']).toBeUndefined();
      expect(JSON.stringify(cfg)).not.toContain('prometheusremotewrite');
    });
  });
});
