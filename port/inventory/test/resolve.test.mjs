// Cases 2 and 3: specifier resolution.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { createContext } from '../lib/context.mjs';
import { resolveSpecifier } from '../lib/resolve.mjs';
import { scanWorkspaces } from '../lib/workspaces.mjs';
import { cleanup, codes, makeRepo } from './helpers.mjs';

describe('resolve', () => {
  /** @type {string} */
  let root;
  /** @type {ReturnType<typeof createContext>} */
  let ctx;
  before(() => {
    root = makeRepo();
    ctx = createContext(root);
    scanWorkspaces(ctx);
  });
  after(() => cleanup(root));

  const app = 'packages/app/src/Brand.tsx';

  it('2. resolves relative, .js to .ts, /index, aliases, workspace dist paths, and externals', () => {
    assert.deepEqual(resolveSpecifier(ctx, app, './lib'), { kind: 'file', path: 'packages/app/src/lib.ts' });
    assert.deepEqual(resolveSpecifier(ctx, app, './lib.js'), { kind: 'file', path: 'packages/app/src/lib.ts' });
    assert.deepEqual(resolveSpecifier(ctx, app, './components'), {
      kind: 'file',
      path: 'packages/app/src/components/index.ts',
    });
    assert.deepEqual(resolveSpecifier(ctx, app, '@/lib'), { kind: 'file', path: 'packages/app/src/lib.ts' });
    // Alias declared in a tsconfig reached through `extends`.
    assert.deepEqual(resolveSpecifier(ctx, 'packages/api/src/config.ts', '@/tasks/types'), {
      kind: 'file',
      path: 'packages/api/src/tasks/types.ts',
    });
    assert.deepEqual(resolveSpecifier(ctx, app, '@hyperdx/common-utils/dist/core/metadata'), {
      kind: 'file',
      path: 'packages/common-utils/src/core/metadata.ts',
    });
    assert.deepEqual(resolveSpecifier(ctx, app, '@hyperdx/common-utils/dist/core'), {
      kind: 'file',
      path: 'packages/common-utils/src/core/index.ts',
    });
    assert.deepEqual(resolveSpecifier(ctx, app, '@clickhouse/client/dist/x'), {
      kind: 'external',
      pkg: '@clickhouse/client',
    });
    assert.deepEqual(resolveSpecifier(ctx, app, 'lodash/omit'), { kind: 'external', pkg: 'lodash' });
    assert.equal(codes(ctx).includes('W_UNRESOLVED_IMPORT'), false);
  });

  it('3. reports a missing relative file as unresolved with a warning', () => {
    const res = resolveSpecifier(ctx, app, './nope');
    assert.deepEqual(res, { kind: 'unresolved' });
    const w = ctx.warnings.filter(x => x.code === 'W_UNRESOLVED_IMPORT');
    assert.equal(w.length, 1);
    assert.equal(w[0].path, app);
  });
});
