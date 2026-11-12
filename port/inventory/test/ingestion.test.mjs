// Case 21: collector manifest and configs.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { cleanup, makeRepo, scanAll } from './helpers.mjs';

describe('ingestion', () => {
  /** @type {string} */
  let root;
  /** @type {ReturnType<typeof scanAll>} */
  let r;
  before(() => {
    root = makeRepo();
    r = scanAll(root);
  });
  after(() => cleanup(root));

  it('21. parses the builder manifest, flow and block pipelines, and flags the ClickHouse exporter', () => {
    const b = r.ingestion.builderManifests;
    assert.equal(b.length, 1);
    assert.deepEqual(
      b[0].components.map(c => [c.section, c.name]),
      [
        ['receivers', 'otlpreceiver'],
        ['processors', 'batchprocessor'],
        ['exporters', 'clickhouseexporter'],
      ],
    );

    const cfg = r.ingestion.collectorConfigs.find(c => c.file === 'docker/otel-collector/config.yaml');
    assert.ok(cfg);
    assert.deepEqual(cfg.receivers, ['otlp/hyperdx']);
    assert.deepEqual(cfg.processors, ['memory_limiter']);
    assert.deepEqual(cfg.exporters, ['clickhouse', 'debug']);
    assert.deepEqual(cfg.pipelines, [
      { name: 'logs', receivers: ['otlp/hyperdx'], processors: ['memory_limiter'], exporters: ['clickhouse', 'debug'] },
      { name: 'traces', receivers: ['otlp/hyperdx'], processors: ['memory_limiter'], exporters: ['clickhouse'] },
    ]);
    assert.deepEqual(r.ingestion.clickhouseExporters, [
      { file: 'docker/otel-collector/config.yaml', name: 'clickhouse' },
    ]);
    assert.deepEqual(r.ingestion.goSources, [
      {
        file: 'packages/otel-collector/main.go',
        package: 'main',
        clickhouseImports: ['github.com/ClickHouse/clickhouse-go/v2'],
      },
    ]);
  });
});
