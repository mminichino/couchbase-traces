// Use mutable object so individual tests can flip flags. The values here are
// the defaults used by every test unless explicitly overridden.
const configState = {
  IS_ALL_IN_ONE_IMAGE: false,
  IS_LOCAL_APP_MODE: false,
  IS_DEV: false,
  INGESTION_API_KEY: '' as string,
  IS_PROMQL_ENABLED: false,
  ENABLE_DATADOG_RECEIVER: false,
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
};

describe('opampController', () => {
  beforeEach(() => {
    resetConfig();
  });

  describe('buildOtelCollectorConfig Couchbase ingest', () => {
    it('uses only Couchbase exporters', () => {
      const cfg = buildOtelCollectorConfig([]);

      expect(JSON.stringify(cfg)).not.toContain('clickhouse');
      expect(cfg.service.pipelines.traces.exporters).toEqual([
        'otlphttp/couchbase',
      ]);
      expect(cfg.service.pipelines.metrics.exporters).toEqual([
        'otlphttp/couchbase',
      ]);
      expect(cfg.service.pipelines['logs/out-default'].exporters).toEqual([
        'otlphttp/couchbase',
      ]);
      expect(cfg.service.pipelines['logs/out-rrweb'].exporters).toEqual([
        'otlphttp/couchbase-rrweb',
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
    });
  });

  describe('buildOtelCollectorConfig prometheus receiver', () => {
    it('scrapes only the collector own metrics endpoint', () => {
      const scrapeConfigs = buildOtelCollectorConfig([]).receivers.prometheus
        ?.config.scrape_configs;

      expect(scrapeConfigs).toHaveLength(1);
      expect(scrapeConfigs?.[0]).toEqual({
        job_name: 'otelcol',
        scrape_interval: '30s',
        static_configs: [{ targets: ['0.0.0.0:8888'] }],
      });
    });
  });

  describe('buildOtelCollectorConfig otlp/cbt CORS', () => {
    it('lets browsers cache preflights for 10 minutes', () => {
      const cfg = buildOtelCollectorConfig([]);

      expect(cfg.receivers['otlp/cbt']?.protocols.http.cors).toEqual({
        allowed_origins: ['*'],
        allowed_headers: ['*'],
        max_age: 600,
      });
    });
  });

  describe('buildOtelCollectorConfig otlp/cbt authentication', () => {
    it('accepts bare and bearer-prefixed authorization values for each API key', () => {
      const cfg = buildOtelCollectorConfig([
        { apiKey: 'k1', collectorAuthenticationEnforced: true },
        { apiKey: 'k2', collectorAuthenticationEnforced: true },
      ]);

      expect(cfg.extensions['bearertokenauth/cbt']).toEqual({
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
      expect(cfg.receivers['otlp/cbt']?.protocols.grpc.auth).toEqual({
        authenticator: 'bearertokenauth/cbt',
      });
      expect(cfg.receivers['otlp/cbt']?.protocols.http.auth).toEqual({
        authenticator: 'bearertokenauth/cbt',
      });
    });

    it('includes variants for INGESTION_API_KEY in all-in-one mode', () => {
      configState.IS_ALL_IN_ONE_IMAGE = true;
      configState.INGESTION_API_KEY = 'ingest-key';

      const cfg = buildOtelCollectorConfig([
        { apiKey: 'k1', collectorAuthenticationEnforced: true },
      ]);

      const tokens = cfg.extensions['bearertokenauth/cbt'].tokens;
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
      expect(cfg.service.pipelines.traces.receivers).toContain('datadog');
      expect(cfg.service.pipelines.metrics.receivers).toContain('datadog');
      expect(cfg.service.pipelines['logs/in'].receivers).toContain('datadog');
    });

    it('leaves the datadog receiver unauthenticated when no team API keys exist', () => {
      configState.ENABLE_DATADOG_RECEIVER = true;

      const cfg = buildOtelCollectorConfig([]);

      expect(cfg.receivers.datadog?.auth).toBeUndefined();
      expect(cfg.extensions['bearertokenauth/datadog']).toBeUndefined();
      expect(cfg.service.extensions).not.toContain('bearertokenauth/datadog');
    });

    it('leaves the datadog receiver unauthenticated when collector authentication is not enforced', () => {
      configState.ENABLE_DATADOG_RECEIVER = true;

      const cfg = buildOtelCollectorConfig([
        { apiKey: 'k1', collectorAuthenticationEnforced: false },
      ]);

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

      expect(cfg.extensions['bearertokenauth/datadog']).toEqual({
        header: 'DD-API-KEY',
        scheme: '',
        tokens: ['k1', 'k2'],
      });
      expect(cfg.receivers.datadog?.auth).toEqual({
        authenticator: 'bearertokenauth/datadog',
      });
      expect(cfg.service.extensions).toContain('bearertokenauth/datadog');
      expect(cfg.service.extensions).toContain('bearertokenauth/cbt');
    });
  });
});
