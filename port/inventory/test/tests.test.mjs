// Case 23: test file classification.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { cleanup, makeRepo, scanAll } from './helpers.mjs';

describe('tests', () => {
  /** @type {string} */
  let root;
  /** @type {ReturnType<typeof scanAll>} */
  let r;
  before(() => {
    root = makeRepo({
      files: {
        'packages/app/tests/e2e/helpers/page.ts': "export const home = '/';\n",
        'packages/api/src/__tests__/utils.ts': 'export const util = 1;\n',
      },
    });
    r = scanAll(root);
  });
  after(() => cleanup(root));

  const file = (/** @type {string} */ p) => r.tests.files.find(f => f.path === p);

  it('23. classifies int and e2e files and matches e2e routes to pages', () => {
    assert.equal(file('packages/api/src/__tests__/chart.int.test.ts')?.kind, 'int');
    assert.equal(file('packages/app/src/__tests__/lib.test.ts')?.kind, 'unit');
    assert.equal(file('packages/api/src/__tests__/utils.ts')?.kind, 'support');
    const e2e = file('packages/app/tests/e2e/search.spec.ts');
    assert.equal(e2e?.kind, 'e2e');
    assert.deepEqual(e2e?.routes, ['/search']);
    assert.equal(file('packages/app/tests/e2e/helpers/page.ts')?.kind, 'e2e');
    assert.deepEqual(file('packages/app/src/__tests__/lib.test.ts')?.directImports, ['packages/app/src/lib.ts']);

    assert.deepEqual(
      r.tests.integrationRequires.map(x => `${x.workspace} ${x.target}`),
      [
        '@hyperdx/api ci:int',
        '@hyperdx/api dev:int',
        '@hyperdx/common-utils ci:int',
      ],
    );
    assert.equal(r.tests.integrationRequires[0].command, 'jest --config jest.int.config.js');
  });
});
