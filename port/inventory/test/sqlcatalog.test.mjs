// Cases 14 to 18: SQL literal extraction and classification.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { cleanup, makeRepo, scanAll } from './helpers.mjs';

const CORE = 'packages/common-utils/src/core';

describe('sqlcatalog', () => {
  /** @type {string} */
  let root;
  /** @type {ReturnType<typeof scanAll>} */
  let r;
  before(() => {
    root = makeRepo({
      files: {
        [`${CORE}/q14.ts`]:
          'export const q14 = sqlExpr`SELECT countIf(x) FROM t PREWHERE y SETTINGS max_threads = 1`;\n',
        [`${CORE}/q15.ts`]: 'export const q15 = (fn: string, a: string) => sqlExpr`${fn}If(${a})`;\n',
        [`${CORE}/q16.ts`]: [
          "export const q16a = `toStartOfInterval(ts, INTERVAL 1 minute)`;",
          'export const q16b = sqlExpr`{start:DateTime64(3)}`;',
          '',
        ].join('\n'),
        [`${CORE}/q18.ts`]: "export const q18 = 'SELECT lower(x), arrayMap(y -> y, z) FROM t';\n",
      },
    });
    r = scanAll(root);
  });
  after(() => cleanup(root));

  const find = (/** @type {string} */ category, /** @type {string} */ name) =>
    r.sql.constructs.find(c => c.category === category && c.name === name);

  it('14. classifies countIf and PREWHERE as mapped and records the setting', () => {
    const fn = find('function', 'countIf');
    assert.ok(fn);
    assert.equal(fn.classification, 'mapped');
    assert.ok(fn.sqlppApproach);
    assert.deepEqual(fn.files[0].lines, [1]);
    assert.equal(fn.files[0].workspace, '@hyperdx/common-utils');
    assert.equal(find('clause', 'PREWHERE')?.classification, 'mapped');
    assert.equal(find('clause', 'SETTINGS')?.classification, 'mapped');
    const setting = find('setting', 'max_threads');
    assert.ok(setting);
    assert.equal(setting.classification, 'unmapped');
  });

  it('15. records a dynamic function suffix', () => {
    const s = find('dynamic_suffix', 'If');
    assert.ok(s);
    assert.equal(s.occurrences, 1);
    assert.equal(s.files[0].path, `${CORE}/q15.ts`);
    assert.equal(s.classification, 'mapped');
  });

  it('16. finds an untagged SQL literal and a query parameter type', () => {
    assert.equal(find('function', 'toStartOfInterval')?.classification, 'mapped');
    assert.equal(find('clause', 'INTERVAL')?.classification, 'unmapped');
    const p = find('parameter_type', 'DateTime64(3)');
    assert.ok(p);
    assert.equal(p.classification, 'unmapped');
    assert.equal(find('type', 'DateTime64')?.classification, 'unmapped');
  });

  it('17. records type names in app code and counts the app site', () => {
    const t = find('type', 'LowCardinality');
    assert.ok(t);
    assert.ok(t.files.some(f => f.path === 'packages/app/src/typeSwitch.ts'));
    const site = r.sql.appSites.find(s => s.path === 'packages/app/src/typeSwitch.ts');
    assert.deepEqual(site, { path: 'packages/app/src/typeSwitch.ts', rawSql: 0, typeNames: 1 });
  });

  it('18. classifies lower as portable and arrayMap as unmapped', () => {
    assert.equal(find('function', 'lower')?.classification, 'portable');
    assert.equal(find('function', 'arrayMap')?.classification, 'unmapped');
    assert.equal(find('clause', '->')?.classification, 'unmapped');
    const names = r.sql.constructs.map(c => `${c.category}:${c.name}`);
    assert.deepEqual(names, [...names].sort(), 'sorted by category then name');
  });
});
