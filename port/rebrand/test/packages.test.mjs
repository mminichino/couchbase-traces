// Cases 1-3: workspace rename.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { applyPackages, planPackages } from '../lib/packages.mjs';
import { cleanup, ctxOf, makeRepo, read } from './helpers.mjs';

describe('packages', () => {
  /** @type {string} */
  let root;
  /** @type {any} */
  let ctx;
  before(() => {
    root = makeRepo({
      files: {
        'packages/api/src/run.ts': [
          "import x from '@hyperdx/common-utils/dist/x';",
          "import lucene from '@hyperdx/lucene';",
          "const a = '@hyperdx/apiX';",
          "const b = 'nx run @hyperdx/api:dev';",
          'const c = /^npx @hyperdx\\/cli mcp install/;',
          "const d = '/blob/%40hyperdx%2Fapp%402.36.0/CHANGELOG.md';",
          '',
        ].join('\n'),
        'packages/otel-collector/internal/x/x.go': 'package x\n\nimport "github.com/ClickHouse/ClickStack/packages/otel-collector/internal/y"\n\n// see https://github.com/ClickHouse/ClickStack/issues/1\n',
        'README.md': 'See @hyperdx/common-utils.\n',
      },
    });
    ctx = ctxOf(root);
  });
  after(() => cleanup(root));

  it('plans one rename per workspace', () => {
    const { renames } = planPackages(ctx);
    assert.deepEqual(
      renames.map(r => `${r.from} -> ${r.to}`),
      [
        '@hyperdx/api -> @example-traces/api',
        '@hyperdx/app -> @example-traces/app',
        '@hyperdx/cli -> @example-traces/cli',
        '@hyperdx/common-utils -> @example-traces/common-utils',
        '@hyperdx/otel-collector -> @example-traces/otel-collector',
      ],
    );
  });

  it('1. renames exact names only', () => {
    const { renames } = planPackages(ctx);
    applyPackages(ctx, renames);
    const ts = read(root, 'packages/api/src/run.ts');
    assert.match(ts, /'@example-traces\/common-utils\/dist\/x'/);
    assert.match(ts, /nx run @example-traces\/api:dev/);
    assert.match(ts, /npx @example-traces\\\/cli mcp install/);
    assert.match(ts, /%40example-traces%2Fapp%402\.36\.0/);
    assert.match(ts, /'@hyperdx\/lucene'/);
    assert.match(ts, /'@hyperdx\/apiX'/);
    assert.equal(read(root, 'README.md'), 'See @example-traces/common-utils.\n');
    assert.match(read(root, 'packages/api/package.json'), /"name": "@example-traces\/api"/);
    assert.match(read(root, 'package.json'), /nx run @example-traces\/api:dev/);
  });

  it('2. internal dependencies become workspace:*', () => {
    const api = JSON.parse(read(root, 'packages/api/package.json'));
    assert.equal(api.dependencies['@example-traces/common-utils'], 'workspace:*');
    assert.equal(api.dependencies['@hyperdx/lucene'], '^1.0.0');
    const app = JSON.parse(read(root, 'packages/app/package.json'));
    assert.equal(app.dependencies['@example-traces/api'], 'workspace:*');
    assert.equal(app.dependencies['@example-traces/common-utils'], 'workspace:*');
    assert.equal(JSON.parse(read(root, 'packages/cli/package.json')).dependencies['@example-traces/common-utils'], 'workspace:*');
  });

  it('3. go.mod and .go imports follow the origin repository', () => {
    assert.match(read(root, 'packages/otel-collector/go.mod'), /^module github\.com\/example-owner\/example-traces\/packages\/otel-collector$/m);
    const go = read(root, 'packages/otel-collector/internal/x/x.go');
    assert.match(go, /"github\.com\/example-owner\/example-traces\/packages\/otel-collector\/internal\/y"/);
    // Comment URLs are left to the URL step.
    assert.match(go, /https:\/\/github\.com\/ClickHouse\/ClickStack\/issues\/1/);
    assert.match(read(root, 'packages/otel-collector/cmd/main.go'), /"github\.com\/example-owner\/example-traces\/packages\/otel-collector\/internal\/x"/);
  });
});
