import * as nodeModule from 'node:module';
import { pathToFileURL } from 'node:url';

/**
 * import-in-the-middle marks some resolutions `commonjs` that Node would
 * otherwise load as builtins or detect itself; give those back. Registered
 * with the synchronous `registerHooks`, so `nextResolve` returns a value.
 */
const restoreFormat: nodeModule.ResolveHook = (
  specifier,
  context,
  nextResolve,
) => {
  const isEntry = context.parentURL === undefined;
  const result = nextResolve(specifier, context) as nodeModule.ResolveFnOutput;
  if (result.format !== 'commonjs') return result;
  if (result.url.startsWith('node:')) return { ...result, format: 'builtin' };
  return isEntry &&
    result.url.startsWith('file:') &&
    !/\.[cm]?[jt]s$/.test(result.url)
    ? { ...result, format: undefined }
    : result;
};

type SyncHooks = { supportsSyncHooks(): boolean; register(): void };

/**
 * Installs the import-in-the-middle ESM loader hook, so ES modules loaded
 * after init are instrumented. It loads the copy next to
 * `@opentelemetry/instrumentation`, the only one that sees the
 * instrumentations' `Hook()` calls. Synchronous hooks where supported,
 * `module.register` otherwise.
 */
export function installEsmHook(): 'sync' | 'async' {
  const hookFile = require.resolve('@opentelemetry/instrumentation/hook.mjs');
  // Our own dependency is never loaded; it lifts the copy above to the 3.5
  // line that restoreFormat expects, and this fails early if it is missing.
  require.resolve('import-in-the-middle/register-hooks.mjs');
  let syncHooks: SyncHooks | undefined;
  try {
    syncHooks = nodeModule.createRequire(hookFile)(
      'import-in-the-middle/register-hooks.mjs',
    ) as SyncHooks;
  } catch {
    // Older import-in-the-middle, or require(esm) disabled.
  }
  if (syncHooks?.supportsSyncHooks() === true) {
    syncHooks.register();
    nodeModule.registerHooks({ resolve: restoreFormat });
    return 'sync';
  }
  nodeModule.register(pathToFileURL(hookFile));
  return 'async';
}
