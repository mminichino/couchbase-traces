// Cases 29 and 30: determinism, --check, render, and preconditions through the CLI.
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { cleanup, cli, git, makeRepo } from './helpers.mjs';

const STATE = 'port/state/inventory';

/** @param {string} root */
function readState(root) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const f of readdirSync(join(root, STATE)).sort()) {
    out[f] = readFileSync(join(root, STATE, f), 'utf8');
  }
  return out;
}

/** @param {string} text */
function withoutVolatile(text) {
  const o = JSON.parse(text);
  delete o.generatedAt;
  delete o.headCommit;
  return JSON.stringify(o);
}

describe('cli', () => {
  /** @type {string[]} */
  const roots = [];
  after(() => roots.forEach(cleanup));
  const repo = (/** @type {Parameters<typeof makeRepo>[0]} */ opts) => {
    const r = makeRepo(opts);
    roots.push(r);
    return r;
  };

  it('29. scan twice is byte-identical apart from generatedAt and headCommit; --check follows', () => {
    const root = repo();
    const first = cli(root, ['scan', '--quiet']);
    assert.equal(first.status, 0, first.stderr);
    const a = readState(root);
    assert.ok(existsSync(join(root, 'port/features.json')), 'skeleton written');
    const featuresText = readFileSync(join(root, 'port/features.json'), 'utf8');

    const second = cli(root, ['scan', '--quiet']);
    assert.equal(second.status, 0, second.stderr);
    const b = readState(root);
    assert.deepEqual(Object.keys(a), Object.keys(b));
    for (const name of Object.keys(a)) {
      assert.ok(a[name].endsWith('\n') && !a[name].endsWith('\n\n'), name);
      if (name === 'manifest.json') assert.equal(withoutVolatile(a[name]), withoutVolatile(b[name]));
      else assert.equal(a[name], b[name], name);
    }
    assert.equal(readFileSync(join(root, 'port/features.json'), 'utf8'), featuresText, 'features.json kept');

    // Commit the outputs: --check passes on a clean tree and ignores the volatile keys.
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'Add port inventory']);
    const ok = cli(root, ['scan', '--check', '--quiet']);
    assert.equal(ok.status, 0, ok.stderr);
    assert.deepEqual(readState(root), b, '--check does not write');

    // A source change makes the committed outputs stale.
    writeFileSync(join(root, 'AGENTS.md'), readFileSync(join(root, 'AGENTS.md'), 'utf8') + '\nHyperDX HDX_EXTRA\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'Edit agents file']);
    const stale = cli(root, ['scan', '--check', '--quiet']);
    assert.equal(stale.status, 102, stale.stderr);
  });

  it('render writes parity.md and the notes block and needs scan output', () => {
    const root = repo();
    const missing = cli(root, ['render', '--quiet']);
    assert.notEqual(missing.status, 0);
    assert.equal(cli(root, ['scan', '--quiet']).status, 0);
    // The skeleton has empty names and descriptions, which render rejects.
    const invalid = cli(root, ['render', '--quiet']);
    assert.notEqual(invalid.status, 0);
    assert.ok(invalid.stderr.includes('description is empty'));
    const featuresPath = join(root, 'port/features.json');
    const features = JSON.parse(readFileSync(featuresPath, 'utf8'));
    for (const f of features.features) {
      f.name = `Name ${f.id}`;
      f.description = `Description of ${f.id}.`;
    }
    writeFileSync(featuresPath, JSON.stringify(features, null, 2) + '\n');
    const res = cli(root, ['render', '--quiet']);
    assert.equal(res.status, 0, res.stderr);
    const notes = readFileSync(join(root, 'docs/port-notes.md'), 'utf8');
    assert.ok(notes.includes('<!-- phase2:start -->'));
    assert.ok(notes.endsWith('## Hand-written notes\n\nKeep this section exactly as written.\n'));
    assert.ok(readFileSync(join(root, 'docs/parity.md'), 'utf8').startsWith('# Parity checklist'));
    const again = cli(root, ['render', '--quiet']);
    assert.equal(again.status, 0, again.stderr);
    assert.equal(readFileSync(join(root, 'docs/port-notes.md'), 'utf8'), notes, 'idempotent');
  });

  it('30. fails with exit 61 when a tracked file outside the allowed paths changed', () => {
    const root = repo();
    // Committed change after the import commit.
    writeFileSync(join(root, 'packages/api/src/extra.ts'), 'export const x = 1;\n');
    git(root, ['add', '-A']);
    git(root, ['commit', '-q', '-m', 'Edit upstream file']);
    const committed = cli(root, ['scan', '--quiet']);
    assert.equal(committed.status, 61, committed.stderr);
    assert.ok(committed.stderr.includes('packages/api/src/extra.ts'));

    // Dirty tracked file.
    const root2 = repo();
    writeFileSync(join(root2, 'packages/api/src/config.ts'), 'export const changed = true;\n');
    const dirty = cli(root2, ['scan', '--quiet']);
    assert.equal(dirty.status, 61, dirty.stderr);

    // Allowed paths are fine.
    const root3 = repo();
    writeFileSync(join(root3, 'AGENTS.md'), 'edited\n');
    assert.equal(cli(root3, ['scan', '--quiet']).status, 0);
  });

  it('rejects unknown commands and flags with exit 2 and prints help', () => {
    const root = repo();
    assert.equal(cli(root, ['bogus']).status, 2);
    assert.equal(cli(root, ['scan', '--nope']).status, 2);
    const help = cli(root, ['--help']);
    assert.equal(help.status, 0);
    assert.ok(help.stdout.includes('scan'));
  });
});
