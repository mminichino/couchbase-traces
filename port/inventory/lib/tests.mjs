// Test file classification and route matching.
import { baseOf, cmp } from './context.mjs';
import { getWorkspaces } from './workspaces.mjs';

/**
 * @typedef {{ files: { path: string, workspace: string | null, kind: 'unit' | 'int' | 'e2e' | 'support',
 *   directImports: string[], routes: string[] }[],
 *   integrationRequires: { workspace: string, target: string, command: string }[] }} Tests
 */

/**
 * Regex matching a page route, with each `[param]` or `[...param]` as `[^/?#]+`.
 * @param {string} route
 */
export function routeRegex(route) {
  const body = route
    .split('/')
    .map(seg =>
      /^\[\.{0,3}[^\]]+\]$/.test(seg) ? '[^/?#]+' : seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    )
    .join('/');
  return new RegExp(`^${body}$`);
}

/**
 * Directories configured as Playwright test directories.
 * @param {import('./context.mjs').Ctx} ctx
 * @returns {string[]}
 */
function playwrightDirs(ctx) {
  /** @type {string[]} */
  const dirs = [];
  for (const f of ctx.files) {
    if (!/^playwright\.config\.[cm]?[jt]s$/.test(baseOf(f))) continue;
    const m = /testDir\s*:\s*['"`]([^'"`]+)['"`]/.exec(ctx.read(f));
    if (!m) continue;
    const configDir = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : '';
    const parts = (configDir ? configDir.split('/') : []).concat(m[1].split('/'));
    /** @type {string[]} */
    const out = [];
    for (const p of parts) {
      if (p === '' || p === '.') continue;
      if (p === '..') out.pop();
      else out.push(p);
    }
    dirs.push(out.join('/'));
  }
  return dirs;
}

/**
 * @param {import('./context.mjs').Ctx} ctx
 * @param {any} importsResult
 * @param {{ kind: string, key: string }[]} entryPoints
 * @returns {Tests}
 */
export function scanTests(ctx, importsResult, entryPoints) {
  const ts = ctx.ts;
  const e2eDirs = playwrightDirs(ctx);
  const pages = entryPoints
    .filter(e => e.kind === 'app_page')
    .map(e => ({ route: e.key, re: routeRegex(e.key) }));

  /** @type {Tests['files']} */
  const files = [];
  for (const mod of importsResult.modules) {
    if (!mod.test) continue;
    const path = mod.path;
    const base = baseOf(path);
    const dirs = path.split('/').slice(0, -1);
    const isE2e = dirs.includes('e2e') || e2eDirs.some(d => path.startsWith(d + '/'));
    /** @type {'unit' | 'int' | 'e2e' | 'support'} */
    let kind = 'support';
    if (isE2e) kind = 'e2e';
    else if (base.includes('.int.test.')) kind = 'int';
    else if (base.includes('.test.') || base.includes('.spec.')) kind = 'unit';

    const direct = new Set();
    for (const e of mod.imports) {
      if (e.target && e.kind !== 'mock') direct.add(e.target);
    }

    /** @type {Set<string>} */
    const routes = new Set();
    if (kind === 'e2e' && pages.length > 0) {
      const text = ctx.read(path);
      if (text && text.includes('/')) {
        const sf = ctx.parse(path, text);
        /** @param {import('typescript').Node} node */
        const visit = node => {
          if (ts.isStringLiteralLike(node) && node.text.startsWith('/')) {
            const cut = node.text.search(/[?#]/);
            const p = cut < 0 ? node.text : node.text.slice(0, cut);
            for (const page of pages) if (page.re.test(p)) routes.add(page.route);
          }
          ts.forEachChild(node, visit);
        };
        visit(sf);
      }
    }

    files.push({
      path,
      workspace: mod.workspace,
      kind,
      directImports: [...direct].sort(cmp),
      routes: [...routes].sort(cmp),
    });
  }
  files.sort((a, b) => cmp(a.path, b.path));

  /** @type {Tests['integrationRequires']} */
  const integrationRequires = [];
  for (const w of getWorkspaces(ctx)) {
    let pkg;
    try {
      pkg = JSON.parse(ctx.read(`${w.dir}/package.json`));
    } catch {
      continue;
    }
    for (const [name, command] of Object.entries(pkg.scripts ?? {})) {
      // `int` as a word of the script name, so `lint` does not count.
      if (/(^|[^a-zA-Z])int($|[^a-zA-Z])/.test(name)) {
        integrationRequires.push({ workspace: w.name, target: name, command: String(command) });
      }
    }
  }
  integrationRequires.sort((a, b) => cmp(a.workspace, b.workspace) || cmp(a.target, b.target));
  return { files, integrationRequires };
}
