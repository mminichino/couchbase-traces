import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  collectScanOperators,
  evaluateExplainPlan,
} from '../lib/explain.mjs';

describe('EXPLAIN plan walker', () => {
  it('passes IndexScan3', () => {
    const plan = {
      '#operator': 'Sequence',
      '~children': [
        {
          '#operator': 'IndexScan3',
          index: 'ix_ts',
          keyspace: 'otel_logs',
        },
      ],
    };
    assert.equal(evaluateExplainPlan('SELECT * FROM otel_logs', plan), 'pass');
    assert.deepEqual(collectScanOperators(plan).allowed, ['IndexScan3']);
  });

  it('passes IndexFtsSearch and KeyScan', () => {
    const plan = {
      '#operator': 'Sequence',
      '~children': [
        { '#operator': 'IndexFtsSearch', index: 'fts' },
        { '#operator': 'KeyScan', keys: ['a'] },
      ],
    };
    assert.equal(evaluateExplainPlan('SELECT META().id', plan), 'pass');
    const scans = collectScanOperators(plan);
    assert.ok(scans.allowed.includes('IndexFtsSearch'));
    assert.ok(scans.allowed.includes('KeyScan'));
  });

  it('fails PrimaryScan3', () => {
    const plan = {
      '#operator': 'PrimaryScan3',
      keyspace: 'otel_logs',
    };
    assert.equal(evaluateExplainPlan('SELECT * FROM otel_logs', plan), 'fail');
    assert.deepEqual(collectScanOperators(plan).primary, ['PrimaryScan3']);
  });

  it('fails nested subquery with a primary scan', () => {
    const plan = {
      '#operator': 'Sequence',
      '~children': [
        {
          '#operator': 'NestedLoopJoin',
          '~child': {
            '#operator': 'Sequence',
            '~children': [{ '#operator': 'PrimaryScan', keyspace: 'inner' }],
          },
        },
        { '#operator': 'IndexScan3', index: 'ix' },
      ],
    };
    assert.equal(evaluateExplainPlan('SELECT 1 FROM a', plan), 'fail');
  });

  it('exempts system keyspaces and INFER/EXPLAIN', () => {
    assert.equal(
      evaluateExplainPlan('SELECT * FROM system:indexes', { '#operator': 'PrimaryScan3' }),
      'exempt',
    );
    assert.equal(evaluateExplainPlan('INFER `otel`.`default`.`otel_logs`', null), 'exempt');
    assert.equal(evaluateExplainPlan('EXPLAIN SELECT 1', null), 'exempt');
  });

  it('reads IndexScan3 from an EXPLAIN row wrapper { plan, text }', () => {
    const row = {
      plan: {
        '#operator': 'Sequence',
        '~children': [{ '#operator': 'IndexScan3', index: 'ix_logs_ts' }],
      },
      text: 'SELECT 1',
    };
    const plan = row.plan;
    assert.equal(evaluateExplainPlan('SELECT 1 FROM otel_logs', plan), 'pass');
    assert.deepEqual(collectScanOperators(plan).allowed, ['IndexScan3']);
  });
});
