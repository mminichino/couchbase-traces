// Cases 6-8: env var discovery and rename.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { applyEnvRenames, discoverEnvVars, planEnvRenames } from '../lib/envvars.mjs';
import { cleanup, ctxOf, makeRepo, read } from './helpers.mjs';

describe('envvars', () => {
  /** @type {string} */
  let root;
  before(() => {
    root = makeRepo({
      files: {
        'packages/api/src/config.ts': [
          "export const key = process.env.HYPERDX_API_KEY;",
          "export const pub = env('NEXT_PUBLIC_HDX_X');",
          "export const other = process.env['HYPERDX_BRACKET'];",
          "export const HDX_COLLECTOR_URL = 'http://localhost:4318';",
          "const { HDX_DESTRUCTURED } = process.env;",
          '',
        ].join('\n'),
        '.env': 'HYPERDX_ENV_FILE=1\n',
        'docker-compose.yml': 'services:\n  app:\n    environment:\n      HDX_MAP_KEY: a\n      - IGNORED=1\n    image: ${HDX_Y:-1}\n',
        'Makefile': 'ci:\n\techo $(HDX_CI_PORT)\n',
        'cmd/main.go': 'package main\n\nfunc main() { _ = os.Getenv("HYPERDX_Z") }\n',
        'docker/Dockerfile': 'FROM node\nARG HDX_BUILD_ARG\nENV HDX_RUNTIME=1\n',
        'docker/collector.yaml': 'timeout: ${env:HYPERDX_COLLECTOR_TIMEOUT:-5s}\n',
        'src/embedded.ts': "export const x = process.env.FOO_HDX_BAR;\n",
      },
    });
  });
  after(() => cleanup(root));

  it('6. discovers names in every context', () => {
    const found = discoverEnvVars(ctxOf(root));
    for (const n of [
      'HYPERDX_API_KEY',
      'NEXT_PUBLIC_HDX_X',
      'HYPERDX_BRACKET',
      'HDX_DESTRUCTURED',
      'HYPERDX_ENV_FILE',
      'HDX_MAP_KEY',
      'HDX_Y',
      'HDX_CI_PORT',
      'HYPERDX_Z',
      'HDX_BUILD_ARG',
      'HDX_RUNTIME',
      'HYPERDX_COLLECTOR_TIMEOUT',
      'HDX_DEV_LOGS_DIR',
    ]) {
      assert.ok(found.names.includes(n), `${n} not discovered: ${found.names.join(', ')}`);
    }
    const ctxs = new Set(found.contexts.map(c => c.context));
    for (const c of ['node', 'env_file', 'compose', 'shell', 'go', 'docker', 'collector']) assert.ok(ctxs.has(c), c);
    assert.deepEqual(found.embedded, ['FOO_HDX_BAR']);
  });

  it('7. a TypeScript constant without an env context is not discovered', () => {
    const found = discoverEnvVars(ctxOf(root));
    assert.ok(!found.names.includes('HDX_COLLECTOR_URL'));
  });

  it('8. HYPERDX_A and HDX_A collide', () => {
    const r = planEnvRenames(['HDX_A', 'HYPERDX_A', 'NEXT_PUBLIC_HDX_B', 'HDX_C'], { prefix: 'CBT_' });
    const map = Object.fromEntries(r.renames.map(x => [x.from, x.to]));
    assert.equal(map.HYPERDX_A, 'CBT_A');
    assert.equal(map.HDX_A, 'CBT_HDX_A');
    assert.equal(map.NEXT_PUBLIC_HDX_B, 'NEXT_PUBLIC_CBT_B');
    assert.equal(map.HDX_C, 'CBT_C');
    assert.equal(r.collisions.length, 1);
    assert.match(r.collisions[0], /HDX_A/);
  });

  it('a target that already exists is a collision', () => {
    const r = planEnvRenames(['HYPERDX_A'], { prefix: 'CBT_', existing: ['CBT_A'] });
    assert.equal(r.renames[0].to, 'CBT_HYPERDX_A');
    assert.equal(r.collisions.length, 1);
  });

  it('applies whole-token renames in every context and leaves embedded names', () => {
    const ctx = ctxOf(root);
    const found = discoverEnvVars(ctx);
    const plan = planEnvRenames(found.names, { prefix: 'EXT_', existing: found.all });
    applyEnvRenames(ctx, plan.renames);
    assert.match(read(root, 'packages/api/src/config.ts'), /process\.env\.EXT_API_KEY/);
    assert.match(read(root, 'packages/api/src/config.ts'), /env\('NEXT_PUBLIC_EXT_X'\)/);
    assert.match(read(root, 'packages/api/src/config.ts'), /HDX_COLLECTOR_URL/);
    assert.match(read(root, 'docker-compose.yml'), /\$\{EXT_Y:-1\}/);
    assert.match(read(root, 'Makefile'), /\$\(EXT_CI_PORT\)/);
    assert.match(read(root, 'cmd/main.go'), /"EXT_Z"/);
    assert.match(read(root, 'src/embedded.ts'), /FOO_HDX_BAR/);
    assert.equal(discoverEnvVars(ctxOf(root)).names.length, 0);
  });
});
