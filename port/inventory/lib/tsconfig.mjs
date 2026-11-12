// tsconfig loading and path aliases.
import { posix } from 'node:path';

/**
 * @typedef {{ prefix: string, suffix: string, wildcard: boolean, targets: string[] }} AliasPattern
 * @typedef {{ baseDir: string, patterns: AliasPattern[] }} Aliases
 */

/**
 * Follow `extends` through tracked files. Child first.
 * @param {import('./context.mjs').Ctx} ctx
 * @param {string} path
 * @param {Set<string>} seen
 * @returns {{ path: string, config: any }[]}
 */
function loadChain(ctx, path, seen) {
  if (seen.has(path) || !ctx.fileSet.has(path)) return [];
  seen.add(path);
  const res = ctx.ts.readConfigFile(path, p => ctx.read(p));
  if (res.error || !res.config) {
    ctx.warn('W_TSCONFIG_PARSE', 'tsconfig could not be parsed', path);
    return [];
  }
  const config = res.config;
  /** @type {{ path: string, config: any }[]} */
  const chain = [{ path, config }];
  let ext = config.extends;
  if (typeof ext === 'string') ext = [ext];
  if (Array.isArray(ext)) {
    // Later entries override earlier ones.
    for (const e of ext.slice().reverse()) {
      if (typeof e !== 'string' || !e.startsWith('.')) continue;
      let target = posix.join(posix.dirname(path), e);
      if (!target.endsWith('.json')) target += '.json';
      chain.push(...loadChain(ctx, target, seen));
    }
  }
  return chain;
}

/**
 * @param {import('./context.mjs').Ctx} ctx
 * @param {{ dir: string }} workspace
 * @returns {Aliases}
 */
export function loadAliases(ctx, workspace) {
  const key = `aliases:${workspace.dir}`;
  const cached = ctx.cache.get(key);
  if (cached) return cached;

  /** @type {Aliases} */
  const result = { baseDir: workspace.dir, patterns: [] };
  const chain = loadChain(ctx, `${workspace.dir}/tsconfig.json`, new Set());

  /** @type {Record<string, string[]> | null} */
  let paths = null;
  let pathsDir = workspace.dir;
  /** @type {string | null} */
  let baseUrl = null;
  let baseUrlDir = workspace.dir;
  for (const c of chain) {
    const opts = c.config?.compilerOptions ?? {};
    if (paths === null && opts.paths && typeof opts.paths === 'object') {
      paths = opts.paths;
      pathsDir = posix.dirname(c.path);
    }
    if (baseUrl === null && typeof opts.baseUrl === 'string') {
      baseUrl = opts.baseUrl;
      baseUrlDir = posix.dirname(c.path);
    }
  }
  result.baseDir =
    baseUrl !== null
      ? posix.normalize(posix.join(baseUrlDir, baseUrl))
      : pathsDir;

  if (paths) {
    for (const [pattern, targets] of Object.entries(paths)) {
      const stars = (pattern.match(/\*/g) ?? []).length;
      if (stars > 1 || !Array.isArray(targets)) {
        ctx.warn(
          'W_TSCONFIG_PATTERN',
          `Unsupported paths pattern "${pattern}"`,
          `${workspace.dir}/tsconfig.json`,
        );
        continue;
      }
      const idx = pattern.indexOf('*');
      result.patterns.push({
        prefix: idx >= 0 ? pattern.slice(0, idx) : pattern,
        suffix: idx >= 0 ? pattern.slice(idx + 1) : '',
        wildcard: idx >= 0,
        targets: targets.filter(t => typeof t === 'string'),
      });
    }
    result.patterns.sort(
      (a, b) => b.prefix.length - a.prefix.length || (a.prefix < b.prefix ? -1 : 1),
    );
  }
  ctx.cache.set(key, result);
  return result;
}
