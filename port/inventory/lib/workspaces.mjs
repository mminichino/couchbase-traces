// Workspace map.
import { cmp, extOf } from './context.mjs';

/**
 * @typedef {{ name: string, dir: string, private: boolean, languages: string[],
 *   scripts: string[], ciTargets: string[], workspaceDeps: string[], externalDeps: string[],
 *   sourceFiles: number, testFiles: number, hasTsconfig: boolean, role: string }} Workspace
 */

const ROLES = {
  app: 'web UI',
  api: 'API server and tasks',
  'common-utils': 'shared query and data layer',
  'otel-collector': 'ingestion collector',
  cli: 'command-line client',
  'hdx-eval': 'evaluation harness',
};

export const ROLE = {
  APP: 'web UI',
  API: 'API server and tasks',
  COMMON: 'shared query and data layer',
  COLLECTOR: 'ingestion collector',
  CLI: 'command-line client',
};

const TS_EXT = new Set(['.ts', '.tsx', '.mts', '.cts']);
const JS_EXT = new Set(['.js', '.jsx', '.mjs', '.cjs']);

/**
 * @param {import('./context.mjs').Ctx} ctx
 * @param {string} path
 */
function readJson(ctx, path) {
  if (!ctx.fileSet.has(path)) return null;
  try {
    return JSON.parse(ctx.read(path));
  } catch {
    ctx.warn('W_JSON_PARSE', 'Invalid JSON', path);
    return null;
  }
}

/**
 * @param {import('./context.mjs').Ctx} ctx
 * @returns {{ workspaces: Workspace[] }}
 */
export function scanWorkspaces(ctx) {
  const cached = ctx.cache.get('workspaces');
  if (cached) return cached;

  const rootPkg = readJson(ctx, 'package.json');
  let globs = [];
  if (rootPkg) {
    if (Array.isArray(rootPkg.workspaces)) globs = rootPkg.workspaces;
    else if (rootPkg.workspaces && Array.isArray(rootPkg.workspaces.packages))
      globs = rootPkg.workspaces.packages;
  }

  /** @type {Set<string>} */
  const dirs = new Set();
  for (const g of globs) {
    if (typeof g !== 'string') continue;
    const glob = g.replace(/^\.\//, '').replace(/\/+$/, '');
    if (glob.endsWith('/*') && !glob.slice(0, -2).includes('*')) {
      const prefix = glob.slice(0, -2) + '/';
      for (const f of ctx.files) {
        if (!f.startsWith(prefix) || !f.endsWith('/package.json')) continue;
        const rest = f.slice(prefix.length, -'/package.json'.length);
        if (rest && !rest.includes('/')) dirs.add(prefix + rest);
      }
    } else if (!glob.includes('*')) {
      if (ctx.fileSet.has(`${glob}/package.json`)) dirs.add(glob);
    } else {
      ctx.warn(
        'W_WORKSPACE_GLOB',
        `Unsupported workspace glob "${g}"; only a trailing /* is supported`,
        'package.json',
      );
    }
  }

  const sortedDirs = [...dirs].sort(cmp);
  /** @type {{ dir: string, pkg: any }[]} */
  const pkgs = [];
  for (const dir of sortedDirs) {
    const pkg = readJson(ctx, `${dir}/package.json`);
    if (pkg && typeof pkg.name === 'string') pkgs.push({ dir, pkg });
  }
  const names = new Set(pkgs.map(p => p.pkg.name));

  /** @type {Workspace[]} */
  const workspaces = [];
  for (const { dir, pkg } of pkgs) {
    const prefix = dir + '/';
    const langs = new Set();
    let sourceFiles = 0;
    let testFiles = 0;
    let hasTsconfig = false;
    for (const f of ctx.files) {
      if (!f.startsWith(prefix)) continue;
      const rel = f.slice(prefix.length);
      if (rel === 'tsconfig.json') hasTsconfig = true;
      const ext = extOf(f);
      if (ext === '.go') langs.add('go');
      if (ctx.isSource(f)) {
        if (TS_EXT.has(ext)) langs.add('typescript');
        else if (JS_EXT.has(ext)) langs.add('javascript');
        if (ctx.isTest(f)) testFiles++;
        else sourceFiles++;
      }
    }
    const scripts = Object.keys(pkg.scripts ?? {}).sort(cmp);
    const deps = Object.keys({
      ...(pkg.dependencies ?? {}),
      ...(pkg.devDependencies ?? {}),
    });
    const workspaceDeps = deps
      .filter(d => names.has(d) && d !== pkg.name)
      .sort(cmp);
    const externalDeps = deps
      .filter(d => !names.has(d) || d === pkg.name)
      .sort(cmp);
    const base = dir.slice(dir.lastIndexOf('/') + 1);
    /** @type {string} */
    let role = ROLES[/** @type {keyof typeof ROLES} */ (base)] ?? 'unknown';
    if (role === 'unknown') {
      ctx.warn(
        'W_UNKNOWN_WORKSPACE',
        `Workspace ${pkg.name} has no known role`,
        dir,
      );
    }
    workspaces.push({
      name: pkg.name,
      dir,
      private: pkg.private === true,
      languages: [...langs].sort(cmp),
      scripts,
      ciTargets: scripts.filter(s => s.startsWith('ci:')),
      workspaceDeps,
      externalDeps,
      sourceFiles,
      testFiles,
      hasTsconfig,
      role,
    });
  }
  workspaces.sort((a, b) => cmp(a.dir, b.dir));
  const result = { workspaces };
  ctx.cache.set('workspaces', result);
  return result;
}

/**
 * Cached workspace list.
 * @param {import('./context.mjs').Ctx} ctx
 * @returns {Workspace[]}
 */
export function getWorkspaces(ctx) {
  return scanWorkspaces(ctx).workspaces;
}

/**
 * The workspace containing a path, by longest directory prefix.
 * @param {import('./context.mjs').Ctx} ctx
 * @param {string} path
 * @returns {Workspace | null}
 */
export function workspaceOf(ctx, path) {
  let list = ctx.cache.get('workspacesByDirDesc');
  if (!list) {
    list = getWorkspaces(ctx)
      .slice()
      .sort((a, b) => b.dir.length - a.dir.length);
    ctx.cache.set('workspacesByDirDesc', list);
  }
  for (const w of list) {
    if (path === w.dir || path.startsWith(w.dir + '/')) return w;
  }
  return null;
}

/**
 * @param {import('./context.mjs').Ctx} ctx
 * @param {string} role
 * @returns {Workspace | null}
 */
export function workspaceByRole(ctx, role) {
  return getWorkspaces(ctx).find(w => w.role === role) ?? null;
}
