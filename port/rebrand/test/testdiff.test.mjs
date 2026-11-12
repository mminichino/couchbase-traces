// Case 18: substitution-only test diff.
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { testDiff } from '../lib/testdiff.mjs';
import { cleanup, commitFiles, ctxOf, git, makeRepo } from './helpers.mjs';

const PLAN = {
  schemaVersion: 1,
  packages: { renames: [{ from: '@hyperdx/common-utils', to: '@example-traces/common-utils', dir: 'packages/common-utils' }] },
  env: { renames: [{ from: 'HYPERDX_X', to: 'EXT_X' }] },
};
const MAP = {
  schemaVersion: 1,
  entries: [{ token: 'ClickStack', replacement: 'Example Traces', status: 'approved', reason: null, occurrences: 1, files: [] }],
};

const T1 = "import { x } from '@hyperdx/common-utils';\nit('a', () => {\n  expect(process.env.HYPERDX_X).toBe('ClickStack');\n  expect(u).toBe('https://github.com/ClickHouse/ClickStack/pull/1');\n});\n";
const T1_SUBST = "import { x } from '@example-traces/common-utils';\nit('a', () => {\n  expect(process.env.EXT_X).toBe('Example Traces');\n  expect(u).toBe('https://github.com/example-owner/example-traces/pull/1');\n});\n";

describe('testdiff', () => {
  /** @type {string} */
  let root;
  /** @type {string} */
  let base;
  before(() => {
    root = makeRepo({
      files: {
        'port/state/rebrand/plan.json': JSON.stringify(PLAN),
        'port/rebrand/token-map.json': JSON.stringify(MAP),
        'packages/app/src/__tests__/one.test.ts': T1,
        'packages/app/src/__tests__/two.test.ts': "it('b', () => { expect(1).toBe(1); });\n",
        'packages/app/src/brand/__tests__/brand.test.tsx': "expect(name).toBe('ClickStack');\n",
        'packages/app/src/gone.ts': 'export const gone = 1;\n',
        'packages/app/src/__tests__/gone.test.ts': "import { gone } from '../gone';\nit('g', () => expect(gone).toBe(1));\n",
        'packages/app/src/kept.ts': 'export const kept = 1;\n',
        'packages/app/src/__tests__/kept.test.ts': "import { kept } from '../kept';\nit('k', () => expect(kept).toBe(1));\n",
      },
    });
    base = git(root, ['rev-parse', 'HEAD']).trim();
  });
  after(() => cleanup(root));

  /** @param {string} p @param {string} text */
  const write = (p, text) => {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), text);
  };

  it('18. substitution-only changes pass; extra assertions fail', () => {
    write('packages/app/src/__tests__/one.test.ts', T1_SUBST);
    assert.deepEqual(testDiff(ctxOf(root), base), { ok: true, problems: [] });

    write('packages/app/src/__tests__/two.test.ts', "it('b', () => { expect(1).toBe(1); expect(2).toBe(2); });\n");
    const r = testDiff(ctxOf(root), base);
    assert.equal(r.ok, false);
    assert.equal(r.problems.length, 1);
    assert.match(r.problems[0], /two\.test\.ts/);
    write('packages/app/src/__tests__/two.test.ts', "it('b', () => { expect(1).toBe(1); });\n");
  });

  it('brand module tests may be rewritten', () => {
    write('packages/app/src/brand/__tests__/brand.test.tsx', "expect(name).toBe('Totally different');\n");
    assert.equal(testDiff(ctxOf(root), base).ok, true);
  });

  it('a deleted test needs its non-test imports deleted too', () => {
    rmSync(join(root, 'packages/app/src/__tests__/kept.test.ts'));
    let r = testDiff(ctxOf(root), base);
    assert.equal(r.ok, false);
    assert.match(r.problems[0], /kept\.test\.ts.*still exist/);

    rmSync(join(root, 'packages/app/src/__tests__/gone.test.ts'));
    rmSync(join(root, 'packages/app/src/gone.ts'));
    r = testDiff(ctxOf(root), base);
    assert.equal(r.problems.filter(p => p.includes('gone.test.ts')).length, 0);
  });

  it('a deleted test listed under Removed integrations is allowed', () => {
    write('docs/port-notes.md', '# Notes\n\n### Removed integrations\n\n- packages/app/src/__tests__/kept.test.ts: reason\n');
    assert.equal(testDiff(ctxOf(root), base).ok, true);
    commitFiles(root, {}, 'wip');
  });
});
