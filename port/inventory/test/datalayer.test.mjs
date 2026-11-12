// Cases 12 and 13: data-layer modules and importers.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { cleanup, makeRepo, scanAll } from './helpers.mjs';

describe('datalayer', () => {
  /** @type {string} */
  let root;
  /** @type {ReturnType<typeof scanAll>} */
  let r;
  before(() => {
    root = makeRepo();
    r = scanAll(root);
  });
  after(() => cleanup(root));

  const mod = (/** @type {string} */ p) => r.data.modules.find(m => m.path === p);

  it('12. includes seeds, client importers, clickhouse names, and SQL builders with reasons', () => {
    assert.deepEqual(mod('packages/common-utils/src/queryParser.ts')?.reasons, ['seed']);
    assert.deepEqual(mod('packages/common-utils/src/types.ts')?.reasons, ['seed']);
    assert.deepEqual(mod('packages/common-utils/src/clickhouse/index.ts')?.reasons, ['seed', 'clickhouse_path']);
    assert.deepEqual(mod('packages/api/src/routers/api/clickhouseProxy.ts')?.reasons, ['seed', 'clickhouse_path']);
    assert.deepEqual(mod('packages/api/src/clients/chClient.ts')?.reasons, ['clickhouse_client']);
    assert.deepEqual(mod('packages/common-utils/src/util/clickhouse.ts')?.reasons, ['clickhouse_path']);
    assert.deepEqual(mod('packages/common-utils/src/core/sqlBuilder.ts')?.reasons, ['sql_builder']);
    assert.equal(r.ctx.warnings.some(w => w.code === 'W_SEED_MISSING'), false);
    // Tests never count.
    assert.equal(r.data.modules.some(m => m.path.includes('__tests__')), false);
  });

  it('13. follows barrels and counts namespace member references', () => {
    const render = mod('packages/common-utils/src/core/renderChartConfig.ts');
    assert.ok(render);
    const viaBarrel = render.importers.find(i => i.path === 'packages/api/src/controllers/chart.ts');
    assert.ok(viaBarrel, 'importer through the barrel');
    assert.deepEqual(
      viaBarrel.symbols.map(s => [s.name, s.references]),
      [['renderChartConfig', 3]],
    );
    assert.equal(viaBarrel.workspace, '@hyperdx/api');
    assert.equal(viaBarrel.test, false);
    assert.equal(viaBarrel.typeOnly, false);
    assert.equal(viaBarrel.symbols[0].lines.length, 3);

    const meta = mod('packages/common-utils/src/core/metadata.ts');
    assert.ok(meta);
    const ns = meta.importers.find(i => i.path === 'packages/api/src/controllers/chart.ts');
    assert.ok(ns);
    assert.deepEqual(
      ns.symbols.map(s => [s.name, s.references]),
      [
        ['getColumns', 1],
        ['getTables', 2],
      ],
    );
    assert.equal(meta.serverSide, true);
    assert.equal(mod('packages/common-utils/src/queryParser.ts')?.serverSide, false);
  });
});
