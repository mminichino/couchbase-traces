import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  imageTags,
  parseSemver,
  VersionInputError,
} from '../release/semver.mjs';
import {
  applyEdits,
  planVersionEdits,
  verifyVersions,
} from '../release/set-version.mjs';
import { VERSION_LOCATIONS } from '../release/version-locations.mjs';

const REPO = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const SCRIPT = path.join(REPO, 'scripts/release/set-version.mjs');
const FILES = [...new Set(VERSION_LOCATIONS.map(l => l.file))];

let root;

/** Copies the real files, so drift in the repo fails here before a release. */
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'set-version-'));
  for (const file of FILES) {
    fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    fs.copyFileSync(path.join(REPO, file), path.join(root, file));
  }
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const run = (...args) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    env: { ...process.env, CBT_SET_VERSION_ROOT: root },
    encoding: 'utf8',
  });

describe('parseSemver', () => {
  it('accepts release and prerelease versions', () => {
    assert.deepEqual(parseSemver('1.0.0'), {
      major: 1,
      minor: 0,
      patch: 0,
      prerelease: null,
    });
    assert.equal(parseSemver('1.2.3-rc.1').prerelease, 'rc.1');
  });

  for (const bad of [
    'v1.0.0',
    '1.0',
    '1.0.0+build.5',
    '01.0.0',
    '',
    '1.0.0-',
  ]) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      assert.throws(() => parseSemver(bad), VersionInputError);
    });
  }
});

describe('imageTags', () => {
  it('tags a release X.Y.Z, X.Y, X and latest when asked (Q2)', () => {
    assert.deepEqual(imageTags(parseSemver('1.0.0'), { latest: true }), [
      '1.0.0',
      '1.0',
      '1',
      'latest',
    ]);
    assert.deepEqual(imageTags(parseSemver('1.2.3'), { latest: false }), [
      '1.2.3',
      '1.2',
      '1',
    ]);
  });

  it('tags a prerelease with its exact version only', () => {
    assert.deepEqual(imageTags(parseSemver('1.0.0-rc.1'), { latest: true }), [
      '1.0.0-rc.1',
    ]);
  });
});

describe('version locations', () => {
  it('pins the location list (section 3); hdx-eval is excluded (Q5)', () => {
    assert.deepEqual(
      VERSION_LOCATIONS.map(l => l.id),
      [
        'pkg:root',
        'pkg:api',
        'pkg:app',
        'pkg:cli',
        'pkg:common-utils',
        'pkg:ingest',
        'pkg:otel-collector',
        'env:CODE_VERSION',
        'env:IMAGE_VERSION',
        'env:IMAGE_VERSION_SUB_TAG',
        'env:IMAGE_NIGHTLY_TAG',
        'env-example:IMAGE_VERSION',
        'doc:DEPLOY.md:app',
        'doc:DEPLOY.md:all-in-one',
        'doc:LOCAL.md:all-in-one',
        'doc:development.md:all-in-one',
      ],
    );
    assert.ok(!FILES.includes('packages/hdx-eval/package.json'));
  });

  it('every location in the repo matches exactly once', () => {
    assert.doesNotThrow(() => planVersionEdits(root, '9.9.9'));
  });
});

describe('set-version', () => {
  it('writes every location and then checks clean', () => {
    applyEdits(planVersionEdits(root, '1.0.0'), root);
    assert.deepEqual(verifyVersions(root, '1.0.0'), []);
    assert.deepEqual(planVersionEdits(root, '1.0.0'), []);
    const env = read('.env');
    assert.match(env, /^CODE_VERSION=1\.0\.0$/m);
    assert.match(env, /^IMAGE_VERSION=1$/m);
    assert.match(env, /^IMAGE_VERSION_SUB_TAG=\.0\.0$/m);
    assert.match(env, /^IMAGE_NIGHTLY_TAG=1-nightly$/m);
    assert.equal(
      JSON.parse(read('packages/cli/package.json')).version,
      '1.0.0',
    );
    assert.match(read('DEPLOY.md'), /couchbase-traces:1 *$/m);
  });

  it('changes only the version text', () => {
    const before = Object.fromEntries(FILES.map(f => [f, read(f)]));
    applyEdits(planVersionEdits(root, '1.0.0'), root);
    for (const file of FILES) {
      const a = before[file].split('\n');
      const b = read(file).split('\n');
      assert.equal(a.length, b.length, file);
      const changed = a.filter((line, i) => line !== b[i]);
      assert.ok(changed.length >= 1, `${file} unchanged`);
      for (const line of changed) {
        assert.match(
          line,
          /version|VERSION|NIGHTLY|couchbase-traces/,
          `${file}: ${line}`,
        );
      }
    }
  });

  it('derives prerelease values', () => {
    applyEdits(planVersionEdits(root, '1.1.0-rc.2'), root);
    assert.deepEqual(verifyVersions(root, '1.1.0-rc.2'), []);
    assert.match(read('.env'), /^IMAGE_VERSION_SUB_TAG=\.1\.0-rc\.2$/m);
  });

  it('reports a location that no longer matches once, and writes nothing', () => {
    fs.appendFileSync(path.join(root, '.env'), '\nIMAGE_VERSION=7\n');
    const before = read('package.json');
    assert.throws(
      () => planVersionEdits(root, '1.0.0'),
      /env:IMAGE_VERSION: expected exactly 1 match in \.env, found 2/,
    );
    assert.equal(read('package.json'), before);
    const m = verifyVersions(root, '1.0.0').find(
      x => x.location.id === 'env:IMAGE_VERSION',
    );
    assert.equal(m.actual, null);
  });

  it('restores written files when a later write fails', () => {
    const edits = planVersionEdits(root, '1.0.0');
    const before = Object.fromEntries(FILES.map(f => [f, read(f)]));
    // A directory in place of the last file's temp path makes its write fail.
    const last = edits.at(-1).location.file;
    fs.mkdirSync(path.join(root, `${last}.set-version.${process.pid}.tmp`));
    assert.throws(() => applyEdits(edits, root));
    for (const file of FILES) assert.equal(read(file), before[file], file);
  });
});

describe('CLI', () => {
  it('exits 2 on invalid input', () => {
    assert.equal(run('v1.0.0').status, 2);
    assert.equal(run('1.0.0', '--bogus').status, 2);
  });

  it('--dry-run lists every location and writes nothing', () => {
    const before = read('.env');
    const out = run('9.9.9', '--dry-run');
    assert.equal(out.status, 0, out.stderr);
    for (const loc of VERSION_LOCATIONS)
      assert.match(out.stdout, new RegExp(`^${loc.id} `, 'm'));
    assert.equal(read('.env'), before);
  });

  it('--check exits 1 on a mismatch and 0 once consistent', () => {
    assert.equal(run('3.0.0', '--check').status, 1);
    assert.equal(run('3.0.0').status, 0);
    assert.equal(run('3.0.0', '--check').status, 0);
  });
});
