// Cases 25 and 26: features skeleton and validation.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { skeleton, validateFeatures } from '../lib/features.mjs';
import { cleanup, makeRepo, scanAll } from './helpers.mjs';

describe('features', () => {
  /** @type {string} */
  let root;
  /** @type {ReturnType<typeof scanAll>} */
  let r;
  before(() => {
    root = makeRepo();
    r = scanAll(root);
  });
  after(() => cleanup(root));

  it('25. builds the skeleton groups and areas', () => {
    const file = skeleton(r.entry.entryPoints);
    assert.equal(file.schemaVersion, 1);
    const got = Object.fromEntries(file.features.map(f => [f.id, f.area]));
    assert.deepEqual(got, {
      'api-clickhouse-proxy': 'query_proxy',
      'api-me': 'auth',
      'api-orphan': 'internal',
      'api-sources': 'admin',
      'api-team': 'admin',
      'app-api': 'internal',
      'app-home': 'internal',
      'app-search': 'search',
      'app-x': 'internal',
      cli: 'cli',
      'external-alerts': 'external_api',
      'external-root': 'external_api',
      ingestion: 'ingestion',
      'mcp-misc': 'mcp',
      'mcp-query': 'mcp',
      'task-check-alerts': 'alerts',
      'task-ping': 'internal',
    });
    const f = file.features.find(x => x.id === 'cli');
    assert.ok(f);
    assert.equal(f.entryPoints.length, 5);
    assert.equal(f.name, 'cli');
    assert.equal(f.description, '');
    assert.equal(f.visibility, 'internal');
    assert.equal(f.status, 'not_started');
    assert.equal(f.decision, null);
    assert.deepEqual(
      file.features.map(x => x.id),
      Object.keys(got),
    );
    const all = file.features.flatMap(x => x.entryPoints);
    assert.equal(new Set(all).size, r.entry.entryPoints.length);
  });

  it('26. reports a duplicate id, an unassigned entry point, and an unsigned drop', () => {
    const ids = r.entry.entryPoints.map(e => e.id);
    const n = ids.length;
    const base = {
      name: 'Feature',
      area: 'internal',
      visibility: 'internal',
      description: 'Does something.',
      status: 'not_started',
      decision: null,
    };
    const file = {
      schemaVersion: 1,
      features: [
        { ...base, id: 'dup', entryPoints: ids.slice(0, 5) },
        { ...base, id: 'dup', entryPoints: ids.slice(5, 6) },
        { ...base, id: 'gone', status: 'dropped', entryPoints: ids.slice(6, n - 1) },
      ],
    };
    const errors = validateFeatures(file, r.entry.entryPoints);
    assert.equal(errors.length, 3, errors.join('\n'));
    assert.ok(errors.some(e => e.includes('duplicate feature id')));
    assert.ok(errors.some(e => e.includes(ids[n - 1]) && e.includes('not assigned')));
    assert.ok(errors.some(e => e.includes('dropped requires')));
  });

  it('accepts a valid file and rejects bad shapes', () => {
    const file = skeleton(r.entry.entryPoints);
    for (const f of file.features) {
      f.name = `Name ${f.id}`;
      f.description = 'Does something.';
    }
    assert.deepEqual(validateFeatures(file, r.entry.entryPoints), []);
    assert.ok(validateFeatures({ schemaVersion: 2, features: [] }, []).length > 0);
    assert.ok(validateFeatures({ schemaVersion: 1, features: {} }, []).length > 0);
    const bad = structuredClone(file);
    bad.features[0].status = 'needs_decision';
    bad.features[1].area = 'nope';
    bad.features[2].id = 'Not Kebab';
    bad.features[3].entryPoints = [];
    const errs = validateFeatures(bad, r.entry.entryPoints);
    assert.ok(errs.some(e => e.includes('needs_decision requires decision.note')));
    assert.ok(errs.some(e => e.includes('unknown area')));
    assert.ok(errs.some(e => e.includes('kebab-case')));
    assert.ok(errs.some(e => e.includes('entryPoints is empty')));
  });

  it('allows an empty dropped feature and a replaced feature that names another id', () => {
    const file = skeleton(r.entry.entryPoints);
    for (const f of file.features) {
      f.name = `Name ${f.id}`;
      f.description = 'Does something.';
    }
    const dropped = {
      id: 'gone',
      name: 'Gone',
      area: 'internal',
      visibility: 'internal',
      description: 'Removed.',
      entryPoints: [],
      status: 'dropped',
      decision: {
        note: 'Removed.',
        signedOffBy: 'Michael',
        date: '2026-11-12',
      },
    };
    const target = file.features[0];
    const replaced = {
      id: 'old-page',
      name: 'Old page',
      area: 'internal',
      visibility: 'internal',
      description: 'Replaced.',
      entryPoints: [],
      status: 'replaced',
      decision: {
        note: 'Replaced.',
        replacedBy: target.id,
        signedOffBy: 'Michael',
        date: '2026-11-12',
      },
    };
    file.features.push(dropped, replaced);
    assert.deepEqual(validateFeatures(file, r.entry.entryPoints), []);

    replaced.decision.replacedBy = 'missing-feature';
    const errs = validateFeatures(file, r.entry.entryPoints);
    assert.ok(errs.some(e => e.includes('is not a feature id')));

    replaced.decision.replacedBy = '';
    const missing = validateFeatures(file, r.entry.entryPoints);
    assert.ok(missing.some(e => e.includes('replaced requires') && e.includes('decision.replacedBy')));
  });
});
