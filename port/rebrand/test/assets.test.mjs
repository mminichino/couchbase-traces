// Cases 9-10: brand assets.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { installAssets, requireAssets, validateAssets } from '../lib/assets.mjs';
import { ExitError } from '../lib/names.mjs';
import { cleanup, ctxOf, goodAssets, makeRepo, png, read, TOKENS } from './helpers.mjs';

const KEYS = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', 'base'];
const SCSS = [
  ':root {',
  ...KEYS.map(k => `  --palette-brand-${k}: #000;`),
  '  --mantine-color-yellow-0: var(--palette-brand-50);',
  '  --palette-other: red;',
  '}',
  '',
  '[data-mantine-color-scheme="dark"] {',
  ...KEYS.map(k => `  --palette-brand-${k}: #111;`),
  '  --color-x: var(--palette-brand-300);',
  '}',
  '',
].join('\n');

const APP_FILES = {
  'packages/app/src/theme/_tokens.scss': SCSS,
  'packages/app/pages/_document.tsx': '<link rel="icon" href="/favicons/clickstack/favicon.ico" />\n<link rel="icon" href="/favicons/clickstack/favicon.svg" />\n',
  'packages/app/public/favicons/clickstack/favicon.ico': 'old',
  'packages/app/public/favicons/clickstack/favicon.svg': 'old',
  'packages/app/public/favicons/clickstack/favicon-16x16.png': 'old',
  'packages/app/public/favicons/clickstack/favicon-32x32.png': 'old',
  'packages/app/public/favicons/clickstack/apple-touch-icon.png': 'old',
};

describe('assets', () => {
  it('9. reports a missing tokens.json key and a wrong PNG size', () => {
    const files = goodAssets();
    const tokens = JSON.parse(files['branding/tokens.json']);
    delete tokens.brand['400'];
    const root = makeRepo({
      files: { ...files, 'branding/tokens.json': JSON.stringify(tokens), 'branding/favicon-32x32.png': png(16, 16) },
    });
    try {
      const v = validateAssets(ctxOf(root));
      assert.equal(v.ok, false);
      assert.ok(v.problems.some(p => p.includes('brand.400')), v.problems.join('\n'));
      assert.ok(v.problems.some(p => p.includes('favicon-32x32.png') && p.includes('32x32')), v.problems.join('\n'));
      assert.equal(v.problems.length, 2);
    } finally {
      cleanup(root);
    }
  });

  it('reports missing files and invalid ICO and SVG', () => {
    const root = makeRepo({
      files: { 'branding/logomark.svg': '<svg></svg>', 'branding/favicon.ico': Buffer.from([1, 2, 3, 4, 5, 6]) },
    });
    try {
      const v = validateAssets(ctxOf(root));
      assert.ok(v.problems.some(p => p.includes('logomark.svg') && p.includes('viewBox')));
      assert.ok(v.problems.some(p => p.includes('favicon.ico') && p.includes('not an ICO')));
      assert.ok(v.missing.includes('wordmark-light.svg'));
      assert.throws(() => requireAssets(ctxOf(root)), e => e instanceof ExitError && e.exitCode === 110);
    } finally {
      cleanup(root);
    }
  });

  it('10. install moves favicons, updates links, replaces only token declarations', () => {
    const root = makeRepo({ files: { ...goodAssets(), ...APP_FILES } });
    try {
      const ctx = ctxOf(root);
      installAssets(ctx);
      const dir = join(root, 'packages/app/public/favicons');
      assert.ok(!existsSync(join(dir, 'clickstack')));
      for (const f of ['favicon.ico', 'favicon.svg', 'favicon-16x16.png', 'favicon-32x32.png', 'apple-touch-icon.png']) {
        assert.ok(existsSync(join(dir, 'example-traces', f)), f);
      }
      assert.equal(read(root, 'packages/app/public/favicons/example-traces/favicon.svg'), read(root, 'branding/logomark.svg'));
      assert.ok(existsSync(join(root, 'packages/app/public/brand/wordmark-dark.svg')));
      assert.match(read(root, 'packages/app/pages/_document.tsx'), /\/favicons\/example-traces\/favicon\.ico/);
      assert.ok(!read(root, 'packages/app/pages/_document.tsx').includes('clickstack'));

      const before = SCSS.split('\n');
      const after = read(root, 'packages/app/src/theme/_tokens.scss').split('\n');
      assert.equal(after.length, before.length);
      for (let i = 0; i < before.length; i++) {
        const m = /^\s*--palette-brand-(\w+):/.exec(before[i]);
        if (m) assert.equal(after[i], `  --palette-brand-${m[1]}: ${/** @type {any} */ (TOKENS.brand)[m[1]]};`);
        else assert.equal(after[i], before[i]);
      }
    } finally {
      cleanup(root);
    }
  });

  it('a missing token declaration is E_ASSET_TARGET_MISSING', () => {
    const root = makeRepo({
      files: { ...goodAssets(), ...APP_FILES, 'packages/app/src/theme/_tokens.scss': SCSS.replaceAll('--palette-brand-base', '--palette-brand-zzz') },
    });
    try {
      assert.throws(() => installAssets(ctxOf(root)), e => e instanceof ExitError && e.exitCode === 112);
    } finally {
      cleanup(root);
    }
  });
});
