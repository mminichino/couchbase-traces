// Entry point discovery: app pages, Express routes, MCP tools, tasks, CLI commands, ingestion.
import { cmp, extOf, lineOf } from './context.mjs';
import { resolveExport } from './imports.mjs';
import { ROLE, workspaceByRole } from './workspaces.mjs';

/**
 * @typedef {{ id: string, kind: 'app_page' | 'app_api_route' | 'api_route' | 'mcp_tool' | 'task' | 'cli_command' | 'ingestion',
 *   key: string, file: string, line: number | null, detail: Record<string, any> }} EntryPoint
 */

const SKIPPED_PAGES = new Set(['/_app', '/_document', '/_error', '/404', '/500']);
const HTTP_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'all', 'head', 'options']);
const INGESTION_DIRS = [
  'packages/otel-collector',
  'docker/otel-collector',
  'packages/ingest',
];

/**
 * Route for a file under `pages/`.
 * @param {string} rel path relative to the pages directory, with extension
 */
function routeOf(rel) {
  let route = '/' + rel.slice(0, rel.length - extOf(rel).length);
  if (route === '/index') route = '/';
  else if (route.endsWith('/index')) route = route.slice(0, -'/index'.length);
  return route || '/';
}

/**
 * @param {string[]} parts
 */
function joinPaths(parts) {
  let p = '/' + parts.join('/');
  p = p.replace(/\/{2,}/g, '/');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return p;
}

/**
 * @param {import('./context.mjs').Ctx} ctx
 * @param {import('typescript').Node} node
 */
function textOf(ctx, node) {
  return node.getText();
}

/**
 * Find the module an import binding refers to, following re-exports.
 * @param {any} imports
 * @param {import('./imports.mjs').Module} mod
 * @param {string} local
 */
function findImportBinding(mod, local) {
  for (const edge of mod.imports) {
    if (edge.kind === 'reexport' || edge.kind === 'mock' || edge.kind === 'dynamic') continue;
    for (const binding of edge.bindings) {
      if (binding.local === local) return { edge, binding };
    }
  }
  return null;
}

/**
 * @param {any} imports
 * @param {{ target: string | null }} edge
 * @param {string} imported
 * @returns {string | null}
 */
function bindingFile(imports, edge, imported) {
  const target = edge.target;
  if (!target) return null;
  if (imported === '*') return target;
  const r = resolveExport(imports, target, imported);
  return r ? r.path : target;
}

/**
 * Resolve the last argument of a mount call to a router module.
 * @param {import('./context.mjs').Ctx} ctx
 * @param {any} imports
 * @param {string} filePath
 * @param {import('typescript').Expression} arg
 * @returns {string | null}
 */
function resolveMountTarget(ctx, imports, filePath, arg) {
  const ts = ctx.ts;
  const mod = imports.byPath.get(filePath);
  const info = imports.internal.get(filePath);
  if (!mod || !info) return null;

  if (ts.isIdentifier(arg)) {
    const b = findImportBinding(mod, arg.text);
    if (b) return bindingFile(imports, b.edge, b.binding.imported);
    if (info.decls.has(arg.text)) return filePath;
    return null;
  }

  if (ts.isPropertyAccessExpression(arg) && ts.isIdentifier(arg.expression)) {
    const member = arg.name.text;
    const b = findImportBinding(mod, arg.expression.text);
    if (!b || !b.edge.target) return null;
    const { imported } = b.binding;
    if (imported !== '*' && imported !== 'default') return null;
    const target = b.edge.target;
    const named = resolveExport(imports, target, member);
    if (named) return named.path;
    if (imported === 'default') {
      // Default export that is an object literal of routers.
      const decl = resolveExport(imports, target, 'default');
      const declPath = decl ? decl.path : target;
      const dinfo = imports.internal.get(declPath);
      const dmod = imports.byPath.get(declPath);
      const local = dinfo?.defaultMembers.get(member);
      if (dinfo && dmod && local) {
        const lb = findImportBinding(dmod, local);
        if (lb) return bindingFile(imports, lb.edge, lb.binding.imported);
        if (dinfo.decls.has(local)) return declPath;
      }
    }
    return null;
  }
  return null;
}

/**
 * Prefix path of a commander chain.
 * @param {import('./context.mjs').Ctx} ctx
 * @param {import('typescript').Expression} expr
 * @param {Map<string, import('typescript').Expression>} vars
 * @param {Set<string>} visiting
 * @returns {string[]}
 */
function commandPath(ctx, expr, vars, visiting) {
  const ts = ctx.ts;
  if (ts.isParenthesizedExpression(expr) || ts.isAwaitExpression(expr) || ts.isNonNullExpression(expr))
    return commandPath(ctx, expr.expression, vars, visiting);
  if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) {
    const callee = expr.expression;
    const base = commandPath(ctx, callee.expression, vars, visiting);
    if (callee.name.text === 'command') {
      const lit = expr.arguments[0];
      if (lit && ts.isStringLiteralLike(lit)) {
        const name = lit.text.trim().split(/\s+/)[0];
        if (name) return [...base, name];
      }
    }
    return base;
  }
  if (ts.isIdentifier(expr)) {
    const init = vars.get(expr.text);
    if (init && !visiting.has(expr.text)) {
      visiting.add(expr.text);
      const r = commandPath(ctx, init, vars, visiting);
      visiting.delete(expr.text);
      return r;
    }
  }
  return [];
}

/**
 * @param {import('./context.mjs').Ctx} ctx
 * @param {any} importsResult
 * @returns {{ entryPoints: EntryPoint[] }}
 */
export function scanEntryPoints(ctx, importsResult) {
  const ts = ctx.ts;
  const app = workspaceByRole(ctx, ROLE.APP);
  const api = workspaceByRole(ctx, ROLE.API);
  const cli = workspaceByRole(ctx, ROLE.CLI);

  /** @type {EntryPoint[]} */
  const eps = [];

  // ---- App pages and app API routes -------------------------------------
  if (app) {
    const prefix = `${app.dir}/pages/`;
    for (const f of ctx.files) {
      if (!f.startsWith(prefix) || !ctx.isSource(f) || ctx.isTest(f)) continue;
      const rel = f.slice(prefix.length);
      const route = routeOf(rel);
      if (rel.startsWith('api/')) {
        eps.push({
          id: `app_api_route:${route}`,
          kind: 'app_api_route',
          key: route,
          file: f,
          line: null,
          detail: { route },
        });
        continue;
      }
      if (SKIPPED_PAGES.has(route)) continue;
      eps.push({
        id: `app_page:${route}`,
        kind: 'app_page',
        key: route,
        file: f,
        line: null,
        detail: { route },
      });
    }
  }

  // ---- API workspace: routes and MCP tools ------------------------------
  /** @type {Map<string, { method: string, localPath: string, line: number }[]>} */
  const routesByFile = new Map();
  /** @type {Map<string, { prefix: string, to: string }[]>} */
  const mountsByFile = new Map();
  /** @type {Set<string>} */
  const roots = new Set();

  if (api) {
    const apiPrefix = api.dir + '/';
    for (const f of ctx.files) {
      if (!f.startsWith(apiPrefix) || !ctx.isSource(f) || ctx.isTest(f)) continue;
      const text = ctx.read(f);
      if (
        !text.includes('Router') &&
        !text.includes('express') &&
        !text.includes('registerTool') &&
        !text.includes('.tool(')
      )
        continue;
      const sf = ctx.parse(f, text);

      /** @type {Set<string>} */
      const routerVars = new Set();
      /** @type {Set<string>} */
      const appVars = new Set();
      /** @param {import('typescript').Node} node */
      const findVars = node => {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.initializer &&
          ts.isCallExpression(node.initializer)
        ) {
          const calleeText = textOf(ctx, node.initializer.expression);
          if (calleeText.endsWith('Router')) routerVars.add(node.name.text);
          else if (calleeText === 'express') appVars.add(node.name.text);
        }
        ts.forEachChild(node, findVars);
      };
      findVars(sf);
      if (appVars.size > 0) roots.add(f);

      /** @param {import('typescript').Node} node */
      const visit = node => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
          const callee = node.expression;
          const name = callee.name.text;
          const recv = callee.expression;

          // Routes: router.<method>('/p', ...)
          if (
            HTTP_METHODS.has(name) &&
            ts.isIdentifier(recv) &&
            routerVars.has(recv.text) &&
            node.arguments.length > 0 &&
            ts.isStringLiteralLike(node.arguments[0])
          ) {
            addRoute(f, name, node.arguments[0].text, lineOf(sf, callee.name));
          }
          // Chains: router.route('/p').get(...).post(...)
          else if (HTTP_METHODS.has(name) && ts.isCallExpression(recv)) {
            /** @type {import('typescript').Expression} */
            let cur = recv;
            while (
              ts.isCallExpression(cur) &&
              ts.isPropertyAccessExpression(cur.expression)
            ) {
              const c = cur.expression;
              if (
                c.name.text === 'route' &&
                ts.isIdentifier(c.expression) &&
                routerVars.has(c.expression.text) &&
                cur.arguments.length > 0 &&
                ts.isStringLiteralLike(cur.arguments[0])
              ) {
                addRoute(f, name, cur.arguments[0].text, lineOf(sf, callee.name));
                break;
              }
              cur = c.expression;
            }
          }

          // Mounts: router.use('/prefix', ..., target)
          if (
            name === 'use' &&
            ts.isIdentifier(recv) &&
            (routerVars.has(recv.text) || appVars.has(recv.text)) &&
            node.arguments.length >= 2 &&
            ts.isStringLiteralLike(node.arguments[0])
          ) {
            const last = node.arguments[node.arguments.length - 1];
            const to = resolveMountTarget(ctx, importsResult, f, last);
            if (to) {
              const list = mountsByFile.get(f) ?? [];
              list.push({ prefix: node.arguments[0].text, to });
              mountsByFile.set(f, list);
            } else {
              ctx.warn(
                'W_UNRESOLVED_MOUNT',
                `Cannot resolve router for mount "${node.arguments[0].text}" at line ${lineOf(sf, node)}`,
                f,
              );
            }
          }
        }

        // MCP tools
        if (ts.isCallExpression(node)) {
          const callee = node.expression;
          let isTool = false;
          if (ts.isIdentifier(callee) && callee.text === 'registerTool') isTool = true;
          else if (
            ts.isPropertyAccessExpression(callee) &&
            (callee.name.text === 'registerTool' || callee.name.text === 'tool')
          )
            isTool = true;
          const first = node.arguments[0];
          if (isTool && first && ts.isStringLiteralLike(first)) {
            const marker = '/mcp/tools/';
            const idx = f.indexOf(marker);
            let dir = '';
            if (idx >= 0) {
              const rest = f.slice(idx + marker.length);
              const slash = rest.indexOf('/');
              dir = slash >= 0 ? rest.slice(0, slash) : '';
            }
            eps.push({
              id: `mcp_tool:${first.text}`,
              kind: 'mcp_tool',
              key: first.text,
              file: f,
              line: lineOf(sf, node),
              detail: { toolName: first.text, dir },
            });
          }
        }
        ts.forEachChild(node, visit);
      };

      /**
       * @param {string} file @param {string} method @param {string} localPath @param {number} line
       */
      const addRoute = (file, method, localPath, line) => {
        const list = routesByFile.get(file) ?? [];
        list.push({ method: method.toUpperCase(), localPath, line });
        routesByFile.set(file, list);
      };
      visit(sf);
    }

    // Full paths through mount chains.
    /** @type {Set<string>} */
    const reached = new Set();
    /** @type {EntryPoint[]} */
    const routeEps = [];
    /**
     * @param {string} file @param {string[]} prefixes @param {Set<string>} onChain
     */
    const walk = (file, prefixes, onChain) => {
      reached.add(file);
      for (const r of routesByFile.get(file) ?? []) {
        const path = joinPaths([...prefixes, r.localPath]);
        routeEps.push({
          id: `api_route:${r.method} ${path}`,
          kind: 'api_route',
          key: `${r.method} ${path}`,
          file,
          line: r.line,
          detail: { method: r.method, path, localPath: r.localPath, routerFile: file, mounted: true },
        });
      }
      for (const m of mountsByFile.get(file) ?? []) {
        if (onChain.has(m.to)) continue;
        onChain.add(m.to);
        walk(m.to, [...prefixes, m.prefix], onChain);
        onChain.delete(m.to);
      }
    };
    for (const root of [...roots].sort(cmp)) walk(root, [], new Set([root]));
    eps.push(...routeEps);

    for (const file of [...routesByFile.keys()].sort(cmp)) {
      if (reached.has(file)) continue;
      ctx.warn('W_UNMOUNTED_ROUTER', 'Router has routes but no mount chain from an app', file);
      for (const r of routesByFile.get(file) ?? []) {
        eps.push({
          id: `api_route:${r.method} ?${r.localPath}`,
          kind: 'api_route',
          key: `${r.method} ?${r.localPath}`,
          file,
          line: r.line,
          detail: {
            method: r.method,
            path: `?${r.localPath}`,
            localPath: r.localPath,
            routerFile: file,
            mounted: false,
          },
        });
      }
    }

    // ---- Tasks ----------------------------------------------------------
    const tasksFile = `${api.dir}/src/tasks/index.ts`;
    let taskCount = 0;
    if (ctx.fileSet.has(tasksFile)) {
      const sf = ctx.parse(tasksFile);
      const mod = importsResult.byPath.get(tasksFile);
      /** @type {Map<string, string>} */
      let enumValues = new Map();
      /** @param {import('typescript').SourceFile} s */
      const readEnum = s => {
        /** @type {Map<string, string>} */
        const values = new Map();
        for (const stmt of s.statements) {
          if (ts.isEnumDeclaration(stmt) && stmt.name.text === 'TaskName') {
            for (const m of stmt.members) {
              const name = ts.isIdentifier(m.name) || ts.isStringLiteralLike(m.name) ? m.name.text : null;
              if (name === null) continue;
              values.set(
                name,
                m.initializer && ts.isStringLiteralLike(m.initializer) ? m.initializer.text : name,
              );
            }
          }
        }
        return values;
      };
      enumValues = readEnum(sf);
      if (enumValues.size === 0 && mod) {
        const b = findImportBinding(mod, 'TaskName');
        if (b && b.edge.target) {
          const decl = resolveExport(importsResult, b.edge.target, b.binding.imported);
          const declPath = decl ? decl.path : b.edge.target;
          if (ctx.fileSet.has(declPath)) enumValues = readEnum(ctx.parse(declPath));
        }
      }

      /** @param {import('typescript').Node} node */
      const findReturnNew = node => {
        if (ts.isReturnStatement(node) && node.expression && ts.isNewExpression(node.expression)) {
          return node.expression;
        }
        if (ts.isFunctionLike(node)) return null;
        /** @type {import('typescript').NewExpression | null} */
        let found = null;
        ts.forEachChild(node, c => {
          if (!found) found = findReturnNew(c);
        });
        return found;
      };

      /** @param {import('typescript').Node} node */
      const visitTasks = node => {
        if (
          ts.isCaseClause(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isIdentifier(node.expression.expression) &&
          node.expression.expression.text === 'TaskName'
        ) {
          const member = node.expression.name.text;
          /** @type {import('typescript').NewExpression | null} */
          let newExpr = null;
          for (const s of node.statements) {
            newExpr = findReturnNew(s);
            if (newExpr) break;
          }
          if (newExpr && ts.isIdentifier(newExpr.expression)) {
            const className = newExpr.expression.text;
            const key = enumValues.get(member) ?? member;
            let file = tasksFile;
            if (mod) {
              const b = findImportBinding(mod, className);
              if (b) file = bindingFile(importsResult, b.edge, b.binding.imported) ?? tasksFile;
            }
            taskCount++;
            eps.push({
              id: `task:${key}`,
              kind: 'task',
              key,
              file,
              line: lineOf(sf, node),
              detail: { enumMember: member, className },
            });
          }
        }
        ts.forEachChild(node, visitTasks);
      };
      visitTasks(sf);
    }
    if (taskCount === 0) {
      ctx.warn('W_TASKS_NOT_FOUND', 'No TaskName switch cases returning a task were found', tasksFile);
    }
  }

  // ---- CLI commands ------------------------------------------------------
  if (cli) {
    const prefix = cli.dir + '/';
    for (const f of ctx.files) {
      if (!f.startsWith(prefix) || !ctx.isSource(f) || ctx.isTest(f)) continue;
      const text = ctx.read(f);
      if (!text.includes('.command(')) continue;
      const sf = ctx.parse(f, text);
      /** @type {Map<string, import('typescript').Expression>} */
      const vars = new Map();
      /** @param {import('typescript').Node} node */
      const collect = node => {
        if (
          ts.isVariableDeclaration(node) &&
          ts.isIdentifier(node.name) &&
          node.initializer &&
          !vars.has(node.name.text)
        ) {
          vars.set(node.name.text, node.initializer);
        }
        ts.forEachChild(node, collect);
      };
      collect(sf);
      /** @param {import('typescript').Node} node */
      const visit = node => {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          node.expression.name.text === 'command' &&
          node.arguments.length > 0 &&
          ts.isStringLiteralLike(node.arguments[0])
        ) {
          const name = node.arguments[0].text.trim().split(/\s+/)[0];
          if (name) {
            const prefixPath = commandPath(ctx, node.expression.expression, vars, new Set());
            const key = [...prefixPath, name].join(' ');
            eps.push({
              id: `cli_command:${key}`,
              kind: 'cli_command',
              key,
              file: f,
              line: lineOf(sf, node.expression.name),
              detail: { name },
            });
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  }

  // ---- Ingestion ---------------------------------------------------------
  {
    const builder = `packages/otel-collector/builder-config.yaml`;
    let file = ctx.fileSet.has(builder) ? builder : '';
    if (!file) {
      for (const d of INGESTION_DIRS) {
        const hit = ctx.files.find(f => f.startsWith(d + '/'));
        if (hit) {
          file = hit;
          break;
        }
      }
    }
    if (!file) file = INGESTION_DIRS[0];
    eps.push({
      id: 'ingestion:otel-collector',
      kind: 'ingestion',
      key: 'otel-collector',
      file,
      line: null,
      detail: { dirs: [...INGESTION_DIRS] },
    });
  }

  return { entryPoints: dedupe(ctx, eps) };
}

/**
 * Remove exact duplicates, disambiguate colliding ids, sort by id.
 * @param {import('./context.mjs').Ctx} ctx
 * @param {EntryPoint[]} eps
 * @returns {EntryPoint[]}
 */
function dedupe(ctx, eps) {
  /** @type {Set<string>} */
  const exact = new Set();
  /** @type {EntryPoint[]} */
  const unique = [];
  for (const e of eps) {
    const k = `${e.id}\0${e.file}\0${e.line}`;
    if (exact.has(k)) continue;
    exact.add(k);
    unique.push(e);
  }
  /** @type {Map<string, EntryPoint[]>} */
  const groups = new Map();
  for (const e of unique) {
    const g = groups.get(e.id) ?? [];
    g.push(e);
    groups.set(e.id, g);
  }
  for (const [id, group] of groups) {
    if (group.length < 2) continue;
    ctx.warn(
      'W_DUPLICATE_ENTRYPOINT',
      `Entry point ${id} found in ${group.length} places: ${group.map(g => g.file).join(', ')}`,
      group[0].file,
    );
    for (const e of group) {
      e.key = `${e.key}#${e.file}`;
      e.id = `${e.kind}:${e.key}`;
    }
  }
  // Same file and key but different lines still collide; keep the first.
  /** @type {Set<string>} */
  const finalIds = new Set();
  /** @type {EntryPoint[]} */
  const out = [];
  for (const e of unique) {
    if (finalIds.has(e.id)) continue;
    finalIds.add(e.id);
    out.push(e);
  }
  out.sort((a, b) => cmp(a.id, b.id));
  return out;
}
