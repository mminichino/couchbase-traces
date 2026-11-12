// Cases 4, 5, 6: import extraction, re-export chains, closure.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { closure, resolveExport } from '../lib/imports.mjs';
import { cleanup, makeRepo, scanAll } from './helpers.mjs';

const E = 'packages/common-utils/src/edges';
const C = 'packages/common-utils/src/cycle';
const X = 'packages/common-utils/src/closure';

describe('imports', () => {
  /** @type {string} */
  let root;
  /** @type {ReturnType<typeof scanAll>} */
  let r;
  before(() => {
    root = makeRepo({
      files: {
        [`${E}/d.ts`]: 'export default 1;\nexport const a = 2;\nexport type T = string;\nexport type U = number;\n',
        [`${E}/side.ts`]: 'export {};\n',
        [`${E}/edges.ts`]: [
          "import def from './d';",
          "import { a as b } from './d';",
          "import * as ns from './d';",
          "import './side';",
          "import type { T } from './d';",
          "import { type U } from './d';",
          "export const lazy = () => import('./d');",
          "export const req = require('./d');",
          "jest.mock('./d');",
          'export const all = [def, b, ns];',
          '',
        ].join('\n'),
        [`${C}/a.ts`]: "export * from './b';\nexport const fromA = 'a';\n",
        [`${C}/b.ts`]: "export * from './c';\nexport const fromB = 'b';\n",
        [`${C}/c.ts`]: "export * from './a';\nexport const fromC = 'c';\n",
        [`${X}/m1.ts`]: [
          "import type { T } from './m2';",
          "import { four } from './m4';",
          "jest.mock('./m3');",
          'export const one = four;',
          '',
        ].join('\n'),
        [`${X}/m2.ts`]: 'export type T = string;\n',
        [`${X}/m3.ts`]: 'export const three = 3;\n',
        [`${X}/m4.ts`]: 'export const four = 4;\n',
      },
    });
    r = scanAll(root);
  });
  after(() => cleanup(root));

  it('4. records edge kinds and bindings', () => {
    const mod = r.imports.byPath.get(`${E}/edges.ts`);
    assert.ok(mod);
    const by = (/** @type {string} */ kind, /** @type {(e: any) => boolean} */ pred = () => true) =>
      mod.imports.filter(e => e.kind === kind && pred(e));

    const statics = by('static');
    assert.deepEqual(statics[0].bindings, [{ imported: 'default', local: 'def' }]);
    assert.equal(statics[0].typeOnly, false);
    assert.deepEqual(statics[1].bindings, [{ imported: 'a', local: 'b' }]);
    assert.deepEqual(statics[2].bindings, [{ imported: '*', local: 'ns' }]);
    assert.equal(statics[3].kind, 'static');
    assert.equal(statics[3].typeOnly, true);
    assert.deepEqual(statics[3].bindings, [{ imported: 'T', local: 'T' }]);
    assert.equal(statics[4].typeOnly, true, 'every specifier marked type');

    const side = by('side_effect');
    assert.equal(side.length, 1);
    assert.equal(side[0].target, `${E}/side.ts`);
    assert.deepEqual(side[0].bindings, []);

    assert.equal(by('dynamic').length, 1);
    assert.equal(by('dynamic')[0].target, `${E}/d.ts`);
    assert.equal(by('require').length, 1);
    assert.equal(by('mock').length, 1);
    assert.equal(by('mock')[0].target, `${E}/d.ts`);
    const lines = mod.imports.map(e => e.line);
    assert.deepEqual(lines, [...lines].sort((a, b) => a - b));
  });

  it('5. resolves an export * chain across three files with a cycle', () => {
    const a = `${C}/a.ts`;
    const c = `${C}/c.ts`;
    assert.deepEqual(r.imports.byPath.get(a)?.starReexports, [`${C}/b.ts`]);
    assert.deepEqual(resolveExport(r.imports, a, 'fromC'), { path: c, name: 'fromC' });
    assert.deepEqual(resolveExport(r.imports, c, 'fromB'), { path: `${C}/b.ts`, name: 'fromB' });
    assert.equal(resolveExport(r.imports, a, 'nothing'), null, 'terminates on the cycle');
  });

  it('6. closure excludes type-only and mock edges', () => {
    const start = `${X}/m1.ts`;
    const set = closure(r.imports, [start]);
    assert.deepEqual([...set].sort(), [start, `${X}/m4.ts`]);
    const withTypes = closure(r.imports, [start], { includeTypeOnly: true });
    assert.ok(withTypes.has(`${X}/m2.ts`));
    assert.equal(withTypes.has(`${X}/m3.ts`), false, 'mock edges are never followed');
  });
});
