// Case 21: every apply step is idempotent; CLI preconditions.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';

import { installAssets } from '../lib/assets.mjs';
import { applyDocker } from '../lib/docker.mjs';
import { applyEnvRenames, discoverEnvVars, planEnvRenames } from '../lib/envvars.mjs';
import { applyPackages, planPackages } from '../lib/packages.mjs';
import { applyTokens, proposeTokens } from '../lib/tokens.mjs';
import { applyUrls, planUrls } from '../lib/urls.mjs';
import { cleanup, cli, commitFiles, ctxOf, git, goodAssets, makeRepo, read } from './helpers.mjs';

/** Snapshot of every tracked and untracked file's content. @param {string} root */
function snapshot(root) {
  const files = git(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(f => f && existsSync(join(root, f)));
  return files.map(f => `${f}\0${readFileSync(join(root, f)).toString('latin1')}`).join('\n');
}

describe('idempotence', () => {
  /** @type {string[]} */
  const roots = [];
  after(() => roots.forEach(cleanup));

  it('21. every apply step changes nothing the second time', () => {
    const root = makeRepo({
      files: {
        ...goodAssets(),
        'packages/app/src/theme/_tokens.scss': ':root {\n  --palette-brand-50: #000;\n  --palette-brand-100: #000;\n  --palette-brand-200: #000;\n  --palette-brand-300: #000;\n  --palette-brand-400: #000;\n  --palette-brand-500: #000;\n  --palette-brand-600: #000;\n  --palette-brand-700: #000;\n  --palette-brand-800: #000;\n  --palette-brand-900: #000;\n  --palette-brand-base: #000;\n}\n',
        'packages/app/pages/_document.tsx': '<link href="/favicons/clickstack/favicon.ico" />\n',
        'packages/app/public/favicons/clickstack/favicon.ico': 'old',
        'packages/app/src/strings.ts': "export const a = 'ClickStack';\nexport const u = 'https://github.com/ClickHouse/ClickStack/issues/1';\nexport const hdx = process.env.HDX_Y;\n",
        'packages/otel-collector/builder-config.yaml': 'dist:\n  name: otelcol-hyperdx\n  description: HyperDX OpenTelemetry Collector\n',
      },
    });
    roots.push(root);

    const ctx = () => ctxOf(root);
    /** @type {[string, () => void][]} */
    const steps = [
      ['packages', () => applyPackages(ctx(), planPackages(ctx()).renames.length ? planPackages(ctx()).renames : [{ from: '@hyperdx/api', to: '@example-traces/api', dir: 'packages/api' }])],
      [
        'env',
        () => {
          const f = discoverEnvVars(ctx());
          applyEnvRenames(ctx(), planEnvRenames(f.names, { prefix: 'EXT_', existing: f.all }).renames);
        },
      ],
      [
        'tokens',
        () => {
          const map = proposeTokens(ctx(), null);
          const approved = {
            schemaVersion: 1,
            entries: map.entries.map(e => (e.replacement === null ? { ...e, status: 'allowed', reason: 'external_dependency' } : { ...e, status: 'approved' })),
          };
          applyTokens(ctx(), /** @type {any} */ (approved));
        },
      ],
      ['urls', () => applyUrls(ctx(), planUrls(ctx()))],
      ['assets', () => installAssets(ctx())],
      ['docker', () => applyDocker(ctx())],
    ];
    for (const [name, run] of steps) {
      run();
      const first = snapshot(root);
      run();
      assert.equal(snapshot(root), first, `${name} changed files on the second run`);
    }
    assert.match(read(root, 'packages/app/src/strings.ts'), /'Example Traces'/);
    assert.match(read(root, 'packages/app/src/strings.ts'), /example-owner\/example-traces\/issues\/1/);
  });

  it('CLI: preconditions and usage errors', () => {
    const root = makeRepo();
    roots.push(root);
    assert.equal(cli(root, ['apply', 'tokens']).status, 61);
    // A modified tracked file outside port/ blocks apply packages and apply env.
    writeFileSync(join(root, 'packages/api/src/index.ts'), '// edited\n');
    const r = cli(root, ['apply', 'packages']);
    assert.equal(r.status, 61, r.stderr);
    assert.match(r.stderr, /E_STATE_MISMATCH/);
    assert.equal(cli(root, ['apply', 'env']).status, 61);
    assert.equal(cli(root, ['apply']).status, 2);
    assert.equal(cli(root, ['bogus']).status, 2);
    assert.equal(cli(root, ['verify', 'nope']).status, 2);
    assert.equal(cli(root, ['lockfile-check']).status, 2);
    assert.equal(cli(root, ['test-diff']).status, 2);
  });

  it('CLI: plan writes plan.json, token-map.json, and allowlist.json', () => {
    const root = makeRepo({ files: { 'packages/app/src/a.ts': "export const a = 'HyperDX';\n" } });
    roots.push(root);
    const r = cli(root, ['plan']);
    assert.equal(r.status, 0, r.stderr);
    const plan = JSON.parse(read(root, 'port/state/rebrand/plan.json'));
    assert.equal(plan.packages.renames.length, 5);
    assert.ok(plan.tokens.counts.proposed >= 1);
    const map = JSON.parse(read(root, 'port/rebrand/token-map.json'));
    assert.ok(map.entries.some((/** @type {any} */ e) => e.token === 'HyperDX'));
    assert.deepEqual(JSON.parse(read(root, 'port/rebrand/allowlist.json')), { schemaVersion: 1, entries: [] });
    // Re-running keeps reviewed entries.
    map.entries.find((/** @type {any} */ e) => e.token === 'HyperDX').status = 'approved';
    commitFiles(root, { 'port/rebrand/token-map.json': JSON.stringify(map) }, 'review');
    assert.equal(cli(root, ['plan']).status, 0);
    const again = JSON.parse(read(root, 'port/rebrand/token-map.json'));
    assert.equal(again.entries.find((/** @type {any} */ e) => e.token === 'HyperDX').status, 'approved');
  });
});
