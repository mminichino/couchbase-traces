// Case 1: workspace map.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { cleanup, makeRepo, scanAll } from './helpers.mjs';

describe('workspaces', () => {
  /** @type {string} */
  let root;
  /** @type {ReturnType<typeof scanAll>} */
  let r;
  before(() => {
    root = makeRepo();
    r = scanAll(root);
  });
  after(() => cleanup(root));

  it('1. finds five workspaces with roles; otel-collector is go', () => {
    const ws = r.workspaces.workspaces;
    assert.equal(ws.length, 5);
    const byName = Object.fromEntries(ws.map(w => [w.name, w]));
    assert.equal(byName['@hyperdx/app'].role, 'web UI');
    assert.equal(byName['@hyperdx/api'].role, 'API server and tasks');
    assert.equal(byName['@hyperdx/common-utils'].role, 'shared query and data layer');
    assert.equal(byName['@hyperdx/cli'].role, 'command-line client');
    assert.equal(byName['@hyperdx/otel-collector'].role, 'ingestion collector');
    assert.deepEqual(byName['@hyperdx/otel-collector'].languages, ['go']);
    assert.deepEqual(byName['@hyperdx/app'].languages, ['typescript']);
    assert.deepEqual(byName['@hyperdx/api'].ciTargets, ['ci:int', 'ci:lint', 'ci:unit']);
    assert.deepEqual(byName['@hyperdx/api'].workspaceDeps, ['@hyperdx/common-utils']);
    assert.ok(byName['@hyperdx/api'].externalDeps.includes('express'));
    assert.equal(byName['@hyperdx/api'].hasTsconfig, true);
    assert.equal(byName['@hyperdx/app'].testFiles, 3);
    assert.deepEqual(
      ws.map(w => w.dir),
      [...ws.map(w => w.dir)].sort(),
    );
  });
});
