// Case 22: branding categories.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { cleanup, makeRepo, scanAll } from './helpers.mjs';

describe('branding', () => {
  /** @type {string} */
  let root;
  /** @type {ReturnType<typeof scanAll>} */
  let r;
  before(() => {
    root = makeRepo();
    r = scanAll(root);
  });
  after(() => cleanup(root));

  const hit = (/** @type {string} */ path, /** @type {string} */ term, /** @type {number} [line] */ line) =>
    r.branding.hits.find(h => h.path === path && h.term === term && (line === undefined || h.line === line));

  it('22. classifies env vars, package names, URLs, UI text, identifiers, and assets', () => {
    assert.equal(hit('packages/api/src/config.ts', 'hdx')?.category, 'env_vars');
    assert.equal(hit('packages/app/package.json', 'hyperdx', 2)?.category, 'package_names');
    assert.equal(hit('packages/api/src/debug.ts', 'hyperdx')?.category, 'telemetry_endpoints');
    assert.equal(hit('packages/app/src/Brand.tsx', 'hyperdx')?.category, 'ui_strings');
    assert.equal(hit('packages/api/src/debug.ts', 'hdx')?.category, 'code_identifiers');
    const png = hit('packages/app/public/hyperdx-logo.png', 'hyperdx');
    assert.equal(png?.category, 'assets');
    assert.equal(png?.line, 0);
    // Workspace import specifiers are package names; external ones are dependencies.
    assert.equal(hit('packages/api/src/controllers/chart.ts', 'hyperdx', 1)?.category, 'package_names');
    assert.equal(hit('packages/api/src/clients/chClient.ts', 'clickhouse', 1)?.category, 'external_dependencies');
    assert.equal(hit('packages/otel-collector/main.go', 'clickhouse', 6)?.category, 'external_dependencies');
  });

  it('records one-based columns, trimmed snippets, and sorted hits', () => {
    const h = hit('packages/api/src/config.ts', 'hdx');
    assert.ok(h);
    assert.equal(h.column, 'export const API_KEY = process.env.'.length + 1);
    assert.equal(h.snippet, 'export const API_KEY = process.env.HDX_API_KEY;');
    const keys = r.branding.hits.map(x => `${x.path}\0${String(x.line).padStart(8, '0')}\0${String(x.column).padStart(8, '0')}`);
    assert.deepEqual(keys, [...keys].sort());
    for (const t of r.branding.totals) {
      assert.ok(t.count > 0 && t.files > 0);
    }
    const terms = new Set(r.branding.totals.map(t => t.term));
    for (const term of ['hyperdx', 'clickhouse', 'hdx']) assert.ok(terms.has(term), term);
  });
});
