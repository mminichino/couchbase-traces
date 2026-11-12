// Case 24: plan verification.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { cleanup, makeRepo, scanAll } from './helpers.mjs';

describe('plancheck', () => {
  /** @type {string} */
  let root;
  before(() => {
    root = makeRepo();
  });
  after(() => cleanup(root));

  it('24. reports missing paths and symbols with suggestions and skips real ones', () => {
    const r = scanAll(root);
    assert.deepEqual(r.plan.missingPaths, [
      {
        token: 'packages/api/src/legacy/team.ts',
        document: 'COUCHBASE_PORT_PLAN.md',
        line: 5,
        suggestion: 'packages/api/src/routers/api/team.ts',
      },
    ]);
    assert.deepEqual(r.plan.missingSymbols, [
      { token: 'SearchQueryBuilder', document: 'COUCHBASE_PORT_PLAN.md', line: 7, suggestion: null },
      { token: 'getTable', document: 'COUCHBASE_PORT_PLAN.md', line: 7, suggestion: 'getTables' },
    ]);
    // Existing path, existing symbol, constants, and SQL keywords are not reported.
    const tokens = [...r.plan.missingPaths, ...r.plan.missingSymbols].map(m => m.token);
    for (const ok of ['packages/api/src/api-app.ts', 'renderChartConfig', 'PRODUCT_NAME', 'SELECT']) {
      assert.equal(tokens.includes(ok), false, ok);
    }
  });

  it('warns and returns nothing when the plan is absent', () => {
    const bare = makeRepo({ remove: ['COUCHBASE_PORT_PLAN.md'] });
    try {
      const r = scanAll(bare);
      assert.deepEqual(r.plan, { missingPaths: [], missingSymbols: [] });
      assert.ok(r.ctx.warnings.some(w => w.code === 'W_PLAN_MISSING'));
    } finally {
      cleanup(bare);
    }
  });
});
