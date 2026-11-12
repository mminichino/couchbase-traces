// Cases 19 and 20: ClickHouse DDL parsing.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { cleanup, codes, makeRepo, scanAll } from './helpers.mjs';

describe('schema', () => {
  /** @type {string} */
  let root;
  /** @type {ReturnType<typeof scanAll>} */
  let r;
  before(() => {
    root = makeRepo();
    r = scanAll(root);
  });
  after(() => cleanup(root));

  it('19. parses a Goose table with columns, indexes, engine, order key, and TTL', () => {
    assert.deepEqual(r.schema.placeholders, ['DATABASE']);
    const t = r.schema.tables.find(x => x.name === 'otel_logs');
    assert.ok(t);
    assert.equal(t.file, 'docker/otel-collector/schema/seed/00002_otel_logs.sql');
    assert.deepEqual(
      t.columns.map(c => [c.name, c.type, c.kind]),
      [
        ['Timestamp', 'DateTime64(9)', 'physical'],
        ['Body', 'String', 'physical'],
        ['TimestampTime', 'DateTime', 'default'],
        ['Hash', 'UInt64', 'materialized'],
        ['Upper', 'String', 'alias'],
      ],
    );
    assert.equal(t.columns[0].codec, 'Delta, ZSTD(1)');
    assert.equal(t.columns[2].expression, 'toDateTime(Timestamp)');
    assert.equal(t.columns[3].expression, 'cityHash64(Body)');
    assert.equal(t.columns[4].expression, 'upper(Body)');
    assert.deepEqual(t.indexes, [
      { name: 'idx_body', expression: 'Body', type: 'tokenbf_v1(32768, 3, 0)', granularity: '8' },
      { name: 'idx_ts', expression: 'Timestamp', type: 'minmax', granularity: '1' },
    ]);
    assert.equal(t.engine, 'MergeTree');
    assert.equal(t.partitionBy, 'toDate(TimestampTime)');
    assert.equal(t.orderBy, '(ServiceName, TimestampTime)');
    assert.equal(t.ttl, 'TimestampTime + toIntervalDay(3)');
    assert.equal(t.settings, 'index_granularity = 8192');
    assert.equal(t.primaryKey, null);
    // The Down section is ignored.
    assert.equal(r.schema.other.some(o => o.text.includes('DROP')), false);
    // CREATE DATABASE is not a table.
    assert.ok(codes(r.ctx).includes('W_SCHEMA_UNPARSED'));
  });

  it('20. records a materialized view with its target and sources', () => {
    assert.equal(r.schema.materializedViews.length, 1);
    const mv = r.schema.materializedViews[0];
    assert.equal(mv.name, 'otel_logs_rollup_mv');
    assert.equal(mv.target, 'otel_logs_rollup');
    assert.deepEqual(mv.sources, ['otel_logs']);
    assert.ok(mv.select.startsWith('SELECT'));
    const rollup = r.schema.tables.find(x => x.name === 'otel_logs_rollup');
    assert.ok(rollup);
    assert.equal(rollup.engine, 'SummingMergeTree');
    assert.equal(rollup.orderBy, 'Timestamp');
  });
});
