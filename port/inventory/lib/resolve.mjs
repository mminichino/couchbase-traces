// Module specifier resolution.
import { posix } from 'node:path';
import { extOf } from './context.mjs';
import { loadAliases } from './tsconfig.mjs';
import { getWorkspaces, workspaceOf } from './workspaces.mjs';

/**
 * @typedef {{ kind: 'file', path: string } | { kind: 'external', pkg: string } | { kind: 'unresolved' }} Resolution
 */

const SRC_EXT = ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs'];
const JS_TO_TS = /** @type {Record<string, string[]>} */ ({
  '.js': ['.ts', '.tsx'],
  '.jsx': ['.tsx', '.ts'],
  '.mjs': ['.mts', '.ts'],
  '.cjs': ['.cts', '.ts'],
});

/**
 * @param {import('./context.mjs').Ctx} ctx
 * @param {string} base
 * @returns {string | null}
 */
function tryBase(ctx, base) {
  if (!base || base.startsWith('../') || base === '..') return null;
  if (ctx.fileSet.has(base)) return base;
  const ext = extOf(base);
  const swaps = JS_TO_TS[ext];
  if (swaps) {
    const stem = base.slice(0, -ext.length);
    for (const e of swaps) if (ctx.fileSet.has(stem + e)) return stem + e;
  }
  for (const e of SRC_EXT) if (ctx.fileSet.has(base + e)) return base + e;
  for (const e of SRC_EXT)
    if (ctx.fileSet.has(`${base}/index${e}`)) return `${base}/index${e}`;
  return null;
}

/**
 * Package name of a bare specifier.
 * @param {string} spec
 */
function packageOf(spec) {
  const parts = spec.split('/');
  if (spec.startsWith('@') && parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  return parts[0];
}

/**
 * @param {import('./context.mjs').Ctx} ctx
 * @param {string} fromPath
 * @param {string} specifier
 * @returns {Resolution}
 */
export function resolveSpecifier(ctx, fromPath, specifier) {
  const spec = specifier.includes('?') ? specifier.split('?')[0] : specifier;
  const unresolved = () => {
    ctx.warn(
      'W_UNRESOLVED_IMPORT',
      `Cannot resolve "${specifier}"`,
      fromPath,
    );
    return /** @type {Resolution} */ ({ kind: 'unresolved' });
  };

  // 1. Relative
  if (spec === '.' || spec === '..' || spec.startsWith('./') || spec.startsWith('../')) {
    const base = posix.join(posix.dirname(fromPath), spec);
    const hit = tryBase(ctx, base);
    return hit ? { kind: 'file', path: hit } : unresolved();
  }
  if (spec.startsWith('/')) return unresolved();

  // 2. Alias of the importing file's workspace
  const ws = workspaceOf(ctx, fromPath);
  if (ws) {
    const aliases = loadAliases(ctx, ws);
    let matched = false;
    for (const p of aliases.patterns) {
      let star = '';
      if (p.wildcard) {
        if (
          spec.length < p.prefix.length + p.suffix.length ||
          !spec.startsWith(p.prefix) ||
          !spec.endsWith(p.suffix)
        )
          continue;
        star = spec.slice(p.prefix.length, spec.length - p.suffix.length);
      } else if (spec !== p.prefix) continue;
      matched = true;
      for (const t of p.targets) {
        const target = p.wildcard ? t.replace('*', star) : t;
        const hit = tryBase(ctx, posix.normalize(posix.join(aliases.baseDir, target)));
        if (hit) return { kind: 'file', path: hit };
      }
    }
    if (matched) return unresolved();
  }

  // 3 to 5. Workspace names
  for (const w of getWorkspaces(ctx)) {
    if (spec === w.name) {
      const hit = tryBase(ctx, `${w.dir}/src/index`);
      return hit ? { kind: 'file', path: hit } : unresolved();
    }
    if (spec.startsWith(w.name + '/')) {
      const rest = spec.slice(w.name.length + 1);
      if (rest.startsWith('dist/')) {
        const hit = tryBase(ctx, `${w.dir}/src/${rest.slice(5)}`);
        return hit ? { kind: 'file', path: hit } : unresolved();
      }
      const hit =
        tryBase(ctx, `${w.dir}/src/${rest}`) ?? tryBase(ctx, `${w.dir}/${rest}`);
      return hit ? { kind: 'file', path: hit } : unresolved();
    }
  }

  // 6. External
  return { kind: 'external', pkg: packageOf(spec) };
}
