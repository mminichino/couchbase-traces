import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import {
  check,
  loadAllowlist,
  scanCode,
  scanText,
  targets,
} from '../ci/check-legacy-store-text.mjs';

function fixture(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'legacy-store-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  return root;
}

test('flags string, template, and JSX text but not comments', () => {
  const src = [
    '// legacy store in a comment is fine',
    '/* Legacy Store block comment */',
    "const a = 'Connect to legacy store';",
    'const b = `rows from ${t} in the Legacy Store`;',
    'const c = <p>Open legacy store settings</p>;',
  ].join('\n');
  const hits = scanCode('x.tsx', src);
  assert.deepEqual(
    hits.map(h => h.line),
    [3, 4, 5],
  );
});

test('scans text files line by line', () => {
  const hits = scanText('README.md', 'ok\nUse the legacy store\nok');
  assert.deepEqual(hits, [
    { file: 'README.md', line: 2, text: 'Use the legacy store' },
  ]);
});

test('a planted string fails and the allowlist suppresses it', () => {
  const root = fixture({
    'packages/app/src/a.ts': "export const s = 'Query the legacy store';\n",
    'packages/app/src/__tests__/a.test.ts': "const s = 'legacy store';\n",
    'packages/cli/README.md': '# CLI\n',
    'docs/notes.md': 'We once said "legacy store".\n',
  });
  const files = targets(root);
  assert.ok(files.includes('packages/app/src/a.ts'));
  assert.ok(files.includes('docs/notes.md'));
  assert.ok(!files.some(f => f.includes('__tests__')));

  const failing = check({ root, files });
  assert.deepEqual(failing.failures.map(f => f.file).sort(), [
    'docs/notes.md',
    'packages/app/src/a.ts',
  ]);

  const allowed = check({
    root,
    files,
    allowlist: [
      { file: 'packages/app/src/a.ts', match: 'QUERY THE', reason: 'test' },
      { file: 'docs/notes.md', match: '"legacy store"', reason: 'history' },
    ],
  });
  assert.deepEqual(allowed, { failures: [], stale: [] });
});

test('reports allowlist entries that no longer match', () => {
  const root = fixture({
    'packages/app/src/a.ts': "export const s = 'Couchbase';\n",
  });
  const { failures, stale } = check({
    root,
    allowlist: [
      { file: 'packages/app/src/a.ts', match: 'legacy', reason: 'gone' },
    ],
  });
  assert.equal(failures.length, 0);
  assert.equal(stale.length, 1);
});

test('allowlist entries need a reason', () => {
  const root = fixture({
    'allow.json': JSON.stringify([{ file: 'a', match: 'b' }]),
  });
  assert.throws(() => loadAllowlist(path.join(root, 'allow.json')), /reason/);
});

test('the repository is clean', () => {
  const root = path.resolve(import.meta.dirname, '..', '..');
  const allowlist = loadAllowlist(
    path.join(root, 'scripts', 'ci', 'legacy-store-allowlist.json'),
  );
  assert.deepEqual(check({ allowlist }), { failures: [], stale: [] });
});
