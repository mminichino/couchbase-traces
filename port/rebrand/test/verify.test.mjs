// Cases 19-20: brand term rule and allowlist.
import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';

import { checkBrandModule, checkBrandTerms, verifyStep } from '../lib/verify.mjs';
import { cleanup, ctxOf, makeRepo } from './helpers.mjs';

/** @param {any[]} entries */
const allow = entries => JSON.stringify({ schemaVersion: 1, entries });

describe('verify', () => {
  /** @type {string[]} */
  const roots = [];
  after(() => roots.forEach(cleanup));
  /** @param {Record<string, string>} files */
  const repo = files => {
    const r = makeRepo({ files, base: false });
    roots.push(r);
    return r;
  };

  it('19. leftover brand text is a violation; allowlisting the line passes', () => {
    const files = {
      'port/state/inventory/schema.json': JSON.stringify({ tables: [{ name: 'hyperdx_sessions', columns: [] }] }),
      'packages/app/src/Widget.tsx': [
        "export const W = () => <div>HyperDX</div>;",
        "const hdxDebug = 1; // HyperDX comment",
        "import lucene from '@hyperdx/lucene';",
        "const t = 'hyperdx_sessions';",
        "const k = 'hdx-storage-key';",
        '',
      ].join('\n'),
    };
    const root = repo(files);
    const r = checkBrandTerms(ctxOf(root));
    assert.equal(r.violations.length, 1, JSON.stringify(r.violations));
    assert.equal(r.violations[0].path, 'packages/app/src/Widget.tsx');
    assert.equal(r.violations[0].line, 1);
    assert.equal(r.violations[0].term, 'hyperdx');

    const root2 = repo({
      ...files,
      'port/rebrand/allowlist.json': allow([
        { path: 'packages/app/src/Widget.tsx', term: 'hyperdx', snippet: '<div>HyperDX</div>', reason: 'pending_decision', note: 'n' },
      ]),
    });
    const r2 = checkBrandTerms(ctxOf(root2));
    assert.deepEqual(r2.violations, []);
    assert.deepEqual(r2.warnings, []);
  });

  it('20. an allowlist entry that matches nothing is W_ALLOWLIST_UNUSED', () => {
    const root = repo({
      'packages/app/src/ok.ts': "export const x = 1;\n",
      'port/rebrand/allowlist.json': allow([
        { path: 'packages/app/src/ok.ts', term: 'hyperdx', snippet: 'nothing', reason: 'test_fixture', note: 'n' },
      ]),
    });
    const r = checkBrandTerms(ctxOf(root));
    assert.equal(r.violations.length, 0);
    assert.equal(r.warnings.length, 1);
    assert.equal(r.warnings[0].code, 'W_ALLOWLIST_UNUSED');
  });

  it('standalone hdx and ClickHouse Cloud count; ClickHouse alone does not', () => {
    const root = repo({
      'docs/a.md': 'Use hdx. ClickHouse Cloud is paid. ClickHouse, Inc. owns it. The ClickHouse engine is fine.\n',
    });
    const r = checkBrandTerms(ctxOf(root));
    assert.deepEqual(r.violations.map(v => v.term).sort(), ['clickhouse cloud', 'clickhouse, inc.', 'hdx']);
  });

  it('brand module export check', () => {
    const root = repo({
      'packages/app/src/brand/index.tsx': [
        "export const BRAND_DISPLAY_NAME = 'X';",
        'export function useBrandDisplayName(): string { return BRAND_DISPLAY_NAME; }',
        'export function usePageTitle(page?: string): string { return page ?? ""; }',
        'export function useWordmark() { return null; }',
        'export function useLogomark(props?: { size?: number }) { return props; }',
        '',
      ].join('\n'),
      'packages/app/src/brand/Logomark.tsx': "export default function Logomark({ size = 16, fit = 'square' }: { size?: number; fit?: 'square' | 'symbol' }) { return null; }\n",
      'packages/app/src/brand/Wordmark.tsx': 'export default function Wordmark({ name }: { name: string }) { return null; }\n',
    });
    assert.deepEqual(checkBrandModule(ctxOf(root)), []);
    const bad = repo({
      'packages/app/src/brand/index.tsx': 'export const BRAND_DISPLAY_NAME = "X";\n',
      'packages/app/src/brand/Logomark.tsx': 'export default function Logomark() { return null; }\n',
      'packages/app/src/brand/Wordmark.tsx': 'export default function Wordmark() { return null; }\n',
    });
    assert.ok(checkBrandModule(ctxOf(bad)).length >= 5);
  });

  it('verify env fails while HYPERDX env vars remain, passes after', async () => {
    const root = repo({ 'packages/api/src/c.ts': 'export const k = process.env.HYPERDX_API_KEY;\n' });
    let r = await verifyStep(ctxOf(root), 'env');
    assert.equal(r.status, 'fail');
    const root2 = makeRepo({ base: false, files: { 'packages/api/src/c.ts': 'export const k = process.env.EXT_API_KEY;\n', '.env': 'EXT_A=1\n' } });
    roots.push(root2);
    r = await verifyStep(ctxOf(root2), 'env');
    assert.equal(r.status, 'pass', JSON.stringify(r.checks));
  });
});
