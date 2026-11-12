// Case 27: parity computation.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { computeParity } from '../lib/parity.mjs';
import { cleanup, makeRepo, scanAll } from './helpers.mjs';

describe('parity', () => {
  /** @type {string} */
  let root;
  /** @type {ReturnType<typeof scanAll>} */
  let r;
  before(() => {
    root = makeRepo();
    r = scanAll(root);
  });
  after(() => cleanup(root));

  it('27. leaves shared modules out of exclusive files and counts tests per section 7.14', () => {
    const base = {
      area: 'internal',
      visibility: 'user',
      description: 'd',
      status: 'not_started',
      decision: null,
    };
    const features = {
      schemaVersion: 1,
      features: [
        { ...base, id: 'search', name: 'Search', area: 'search', entryPoints: ['app_page:/search'] },
        { ...base, id: 'x', name: 'X', entryPoints: ['app_page:/x/[id]'] },
      ],
    };
    const parity = computeParity(features, r.entry.entryPoints, r.imports, r.data, r.tests, r.ctx.files);
    const search = parity.features.find(f => f.id === 'search');
    const x = parity.features.find(f => f.id === 'x');
    assert.ok(search && x);

    assert.equal(search.closureSize, 3);
    assert.deepEqual(search.exclusiveFiles, ['packages/app/pages/search/index.tsx', 'packages/app/src/searchOnly.ts']);
    assert.deepEqual(x.exclusiveFiles, ['packages/app/pages/x/[id].tsx', 'packages/app/src/xOnly.ts']);
    assert.equal(search.exclusiveFiles.includes('packages/app/src/lib.ts'), false);

    // lib.test.ts imports only the shared module, so it counts for neither feature.
    assert.deepEqual(search.tests, {
      unit: ['packages/app/src/__tests__/searchOnly.test.ts'],
      int: [],
      e2e: ['packages/app/tests/e2e/search.spec.ts'],
    });
    assert.deepEqual(x.tests, { unit: [], int: [], e2e: [] });

    assert.deepEqual(search.entryPoints, [
      { id: 'app_page:/search', kind: 'app_page', file: 'packages/app/pages/search/index.tsx' },
    ]);
    assert.equal(parity.totals.features, 2);
    assert.equal(parity.totals.entryPoints, r.entry.entryPoints.length);
    assert.deepEqual(
      parity.totals.byStatus.map(b => [b.status, b.count]),
      [
        ['not_started', 2],
        ['in_progress', 0],
        ['ported', 0],
        ['needs_decision', 0],
        ['dropped', 0],
      ],
    );
  });

  it('collects data-layer modules in the closure with the symbols imported by closure files', () => {
    const features = {
      schemaVersion: 1,
      features: [
        {
          id: 'chart',
          name: 'Chart',
          area: 'charts',
          visibility: 'user',
          description: 'd',
          status: 'not_started',
          decision: null,
          entryPoints: ['task:check-alerts'],
        },
      ],
    };
    const eps = r.entry.entryPoints.map(e =>
      e.id === 'task:check-alerts' ? { ...e, file: 'packages/api/src/controllers/chart.ts' } : e,
    );
    const parity = computeParity(features, eps, r.imports, r.data, r.tests, r.ctx.files);
    const dl = parity.features[0].dataLayer;
    const render = dl.find(d => d.path.endsWith('core/renderChartConfig.ts'));
    assert.deepEqual(render?.symbols, ['renderChartConfig']);
    const meta = dl.find(d => d.path.endsWith('core/metadata.ts'));
    assert.deepEqual(meta?.symbols, ['getColumns', 'getTables']);
  });
});
