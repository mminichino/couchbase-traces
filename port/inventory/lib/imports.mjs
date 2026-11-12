// Import and export extraction, import graph.
import { cmp, lineOf } from './context.mjs';
import { resolveSpecifier } from './resolve.mjs';
import { workspaceOf } from './workspaces.mjs';

/**
 * @typedef {{ specifier: string, target: string | null, external: string | null,
 *   kind: 'static' | 'dynamic' | 'require' | 'reexport' | 'side_effect' | 'mock',
 *   typeOnly: boolean, bindings: { imported: string, local: string }[], line: number }} ImportEdge
 * @typedef {{ name: string, kind: string, from: string | null, original: string | null, line: number }} ExportEntry
 * @typedef {{ path: string, workspace: string | null, test: boolean,
 *   imports: ImportEdge[], exports: ExportEntry[], starReexports: string[] }} Module
 * @typedef {{ modules: Module[], byPath: Map<string, Module>,
 *   internal: Map<string, { decls: Set<string>, defaultMembers: Map<string, string> }> }} ImportsResult
 */

/**
 * @param {import('./context.mjs').Ctx} ctx
 * @param {import('typescript').Node} node
 */
function hasModifier(ctx, node, kind) {
  return !!node.modifiers?.some(m => m.kind === kind);
}

/**
 * Names bound by a binding name (identifier or destructuring pattern).
 * @param {import('./context.mjs').Ctx} ctx
 * @param {import('typescript').BindingName} name
 * @param {string[]} out
 */
function bindingNames(ctx, name, out) {
  const ts = ctx.ts;
  if (ts.isIdentifier(name)) out.push(name.text);
  else {
    for (const el of name.elements) {
      if (ts.isOmittedExpression(el)) continue;
      bindingNames(ctx, el.name, out);
    }
  }
}

/**
 * @param {import('./context.mjs').Ctx} ctx
 * @param {import('typescript').Expression | undefined} expr
 */
function stringArg(ctx, expr) {
  if (!expr) return null;
  if (ctx.ts.isStringLiteralLike(expr)) return expr;
  return null;
}

/**
 * Extract a single module.
 * @param {import('./context.mjs').Ctx} ctx
 * @param {string} path
 * @returns {{ module: Module, decls: Set<string>, defaultMembers: Map<string, string> }}
 */
function extractModule(ctx, path) {
  const ts = ctx.ts;
  const SK = ts.SyntaxKind;
  const sf = ctx.parse(path);
  const ws = workspaceOf(ctx, path);

  /** @type {ImportEdge[]} */
  const imports = [];
  /** @type {ExportEntry[]} */
  const exports = [];
  /** @type {Set<string>} */
  const stars = new Set();
  /** @type {Map<string, { target: string | null, imported: string }>} */
  const importMap = new Map();
  /** @type {Map<string, string>} */
  const declKinds = new Map();
  /** @type {Map<string, import('typescript').ObjectLiteralExpression>} */
  const objectLiterals = new Map();
  /** @type {Map<string, string>} */
  const defaultMembers = new Map();

  /**
   * @param {import('typescript').StringLiteralLike} lit
   * @param {ImportEdge['kind']} kind
   * @param {boolean} typeOnly
   * @param {{ imported: string, local: string }[]} bindings
   */
  const addEdge = (lit, kind, typeOnly, bindings) => {
    const specifier = lit.text;
    const res = resolveSpecifier(ctx, path, specifier);
    /** @type {ImportEdge} */
    const edge = {
      specifier,
      target: res.kind === 'file' ? res.path : null,
      external: res.kind === 'external' ? res.pkg : null,
      kind,
      typeOnly,
      bindings,
      line: lineOf(sf, lit),
    };
    imports.push(edge);
    return edge;
  };

  /**
   * @param {string} name @param {string} kind @param {string | null} from
   * @param {string | null} original @param {number} line
   */
  const addExport = (name, kind, from, original, line) => {
    if (exports.some(e => e.name === name && e.kind === kind && e.from === from))
      return;
    exports.push({ name, kind, from, original, line });
  };

  /** Pass 1: edges anywhere in the file. */
  /** @param {import('typescript').Node} node */
  const visit = node => {
    if (ts.isImportDeclaration(node)) {
      const lit = stringArg(ctx, node.moduleSpecifier);
      if (lit) {
        const clause = node.importClause;
        if (!clause) {
          addEdge(lit, 'side_effect', false, []);
        } else {
          /** @type {{ imported: string, local: string }[]} */
          const bindings = [];
          let allNamedType = false;
          if (clause.name) bindings.push({ imported: 'default', local: clause.name.text });
          const nb = clause.namedBindings;
          if (nb) {
            if (ts.isNamespaceImport(nb)) {
              bindings.push({ imported: '*', local: nb.name.text });
            } else {
              for (const el of nb.elements) {
                bindings.push({
                  imported: (el.propertyName ?? el.name).text,
                  local: el.name.text,
                });
              }
              allNamedType =
                !clause.name &&
                nb.elements.length > 0 &&
                nb.elements.every(e => e.isTypeOnly);
            }
          }
          const typeOnly = clause.isTypeOnly || allNamedType;
          const edge = addEdge(lit, 'static', typeOnly, bindings);
          for (const b of bindings) {
            importMap.set(b.local, { target: edge.target, imported: b.imported });
          }
        }
      }
    } else if (ts.isImportEqualsDeclaration(node)) {
      const ref = node.moduleReference;
      if (ts.isExternalModuleReference(ref)) {
        const lit = stringArg(ctx, ref.expression);
        if (lit) {
          const edge = addEdge(lit, 'require', node.isTypeOnly, [
            { imported: '*', local: node.name.text },
          ]);
          importMap.set(node.name.text, { target: edge.target, imported: '*' });
        }
      }
    } else if (ts.isExportDeclaration(node)) {
      const lit = stringArg(ctx, node.moduleSpecifier);
      if (lit) {
        const clause = node.exportClause;
        const line = lineOf(sf, lit);
        if (!clause) {
          const edge = addEdge(lit, 'reexport', node.isTypeOnly, []);
          if (edge.target) stars.add(edge.target);
        } else if (ts.isNamespaceExport(clause)) {
          const edge = addEdge(lit, 'reexport', node.isTypeOnly, [
            { imported: '*', local: clause.name.text },
          ]);
          addExport(clause.name.text, 'reexport', edge.target, '*', line);
        } else {
          const bindings = clause.elements.map(el => ({
            imported: (el.propertyName ?? el.name).text,
            local: el.name.text,
          }));
          const typeOnly =
            node.isTypeOnly ||
            (clause.elements.length > 0 && clause.elements.every(e => e.isTypeOnly));
          const edge = addEdge(lit, 'reexport', typeOnly, bindings);
          for (const b of bindings) {
            addExport(b.local, 'reexport', edge.target, b.imported, line);
          }
        }
      }
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (callee.kind === SK.ImportKeyword) {
        const lit = stringArg(ctx, node.arguments[0]);
        if (lit) addEdge(lit, 'dynamic', false, []);
        else {
          ctx.warn(
            'W_DYNAMIC_IMPORT',
            `Non-literal dynamic import at line ${lineOf(sf, node)}`,
            path,
          );
        }
      } else if (ts.isIdentifier(callee) && callee.text === 'require') {
        const lit = stringArg(ctx, node.arguments[0]);
        if (lit && node.arguments.length === 1) {
          /** @type {{ imported: string, local: string }[]} */
          const bindings = [];
          const parent = node.parent;
          if (
            ts.isVariableDeclaration(parent) &&
            parent.initializer === node
          ) {
            if (ts.isIdentifier(parent.name)) {
              bindings.push({ imported: '*', local: parent.name.text });
            } else if (ts.isObjectBindingPattern(parent.name)) {
              for (const el of parent.name.elements) {
                if (ts.isIdentifier(el.name)) {
                  const prop = el.propertyName;
                  bindings.push({
                    imported:
                      prop && (ts.isIdentifier(prop) || ts.isStringLiteralLike(prop))
                        ? prop.text
                        : el.name.text,
                    local: el.name.text,
                  });
                }
              }
            }
          }
          addEdge(lit, 'require', false, bindings);
        }
      } else if (
        ts.isPropertyAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        (callee.expression.text === 'jest' || callee.expression.text === 'vi') &&
        callee.name.text === 'mock'
      ) {
        const lit = stringArg(ctx, node.arguments[0]);
        if (lit) addEdge(lit, 'mock', false, []);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  /** Pass 2: top-level declarations and export entries. */
  /** @param {import('typescript').VariableStatement} stmt */
  const varKind = stmt => {
    const f = stmt.declarationList.flags;
    if (f & ts.NodeFlags.Const) return 'const';
    if (f & ts.NodeFlags.Let) return 'let';
    return 'var';
  };

  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name) declKinds.set(stmt.name.text, 'function');
    else if (ts.isClassDeclaration(stmt) && stmt.name) declKinds.set(stmt.name.text, 'class');
    else if (ts.isEnumDeclaration(stmt)) declKinds.set(stmt.name.text, 'enum');
    else if (ts.isTypeAliasDeclaration(stmt)) declKinds.set(stmt.name.text, 'type');
    else if (ts.isInterfaceDeclaration(stmt)) declKinds.set(stmt.name.text, 'interface');
    else if (ts.isModuleDeclaration(stmt) && ts.isIdentifier(stmt.name))
      declKinds.set(stmt.name.text, 'namespace');
    else if (ts.isVariableStatement(stmt)) {
      const kind = varKind(stmt);
      for (const d of stmt.declarationList.declarations) {
        /** @type {string[]} */
        const names = [];
        bindingNames(ctx, d.name, names);
        for (const n of names) declKinds.set(n, kind);
        if (
          ts.isIdentifier(d.name) &&
          d.initializer &&
          ts.isObjectLiteralExpression(d.initializer)
        ) {
          objectLiterals.set(d.name.text, d.initializer);
        }
      }
    }
  }

  /** @param {import('typescript').ObjectLiteralExpression} obj */
  const collectDefaultMembers = obj => {
    for (const prop of obj.properties) {
      if (ts.isShorthandPropertyAssignment(prop)) {
        defaultMembers.set(prop.name.text, prop.name.text);
      } else if (ts.isPropertyAssignment(prop)) {
        const key = prop.name;
        const keyText =
          ts.isIdentifier(key) || ts.isStringLiteralLike(key) ? key.text : null;
        if (keyText !== null && ts.isIdentifier(prop.initializer)) {
          defaultMembers.set(keyText, prop.initializer.text);
        }
      }
    }
  };

  for (const stmt of sf.statements) {
    const line = lineOf(sf, stmt);
    if (ts.isExportAssignment(stmt)) {
      const expr = stmt.expression;
      if (ts.isIdentifier(expr)) {
        const imp = importMap.get(expr.text);
        if (imp) addExport('default', 'reexport', imp.target, imp.imported, line);
        else addExport('default', declKinds.get(expr.text) ?? 'const', null, null, line);
        const obj = objectLiterals.get(expr.text);
        if (obj) collectDefaultMembers(obj);
      } else {
        addExport('default', 'const', null, null, line);
        if (ts.isObjectLiteralExpression(expr)) collectDefaultMembers(expr);
        else if (
          ts.isAsExpression(expr) &&
          ts.isObjectLiteralExpression(expr.expression)
        )
          collectDefaultMembers(expr.expression);
      }
      continue;
    }
    if (ts.isExportDeclaration(stmt) && !stmt.moduleSpecifier && stmt.exportClause) {
      if (ts.isNamedExports(stmt.exportClause)) {
        for (const el of stmt.exportClause.elements) {
          const local = (el.propertyName ?? el.name).text;
          const name = el.name.text;
          const imp = importMap.get(local);
          if (imp) addExport(name, 'reexport', imp.target, imp.imported, line);
          else addExport(name, declKinds.get(local) ?? 'const', null, null, line);
        }
      }
      continue;
    }
    if (!hasModifier(ctx, stmt, SK.ExportKeyword)) continue;
    const isDefault = hasModifier(ctx, stmt, SK.DefaultKeyword);
    if (ts.isFunctionDeclaration(stmt)) {
      addExport(isDefault ? 'default' : (stmt.name?.text ?? 'default'), 'function', null, null, line);
    } else if (ts.isClassDeclaration(stmt)) {
      addExport(isDefault ? 'default' : (stmt.name?.text ?? 'default'), 'class', null, null, line);
    } else if (ts.isEnumDeclaration(stmt)) {
      addExport(stmt.name.text, 'enum', null, null, line);
    } else if (ts.isTypeAliasDeclaration(stmt)) {
      addExport(stmt.name.text, 'type', null, null, line);
    } else if (ts.isInterfaceDeclaration(stmt)) {
      addExport(isDefault ? 'default' : stmt.name.text, 'interface', null, null, line);
    } else if (ts.isModuleDeclaration(stmt) && ts.isIdentifier(stmt.name)) {
      addExport(stmt.name.text, 'namespace', null, null, line);
    } else if (ts.isVariableStatement(stmt)) {
      const kind = varKind(stmt);
      for (const d of stmt.declarationList.declarations) {
        /** @type {string[]} */
        const names = [];
        bindingNames(ctx, d.name, names);
        for (const n of names) addExport(n, kind, null, null, lineOf(sf, d));
      }
    }
  }

  exports.sort((a, b) => cmp(a.name, b.name) || a.line - b.line);
  imports.sort((a, b) => a.line - b.line || cmp(a.specifier, b.specifier));

  return {
    module: {
      path,
      workspace: ws ? ws.name : null,
      test: ctx.isTest(path),
      imports,
      exports,
      starReexports: [...stars].sort(cmp),
    },
    decls: new Set(declKinds.keys()),
    defaultMembers,
  };
}

/**
 * @param {import('./context.mjs').Ctx} ctx
 * @param {{ workspaces: import('./workspaces.mjs').Workspace[] }} _workspaces
 * @returns {ImportsResult}
 */
export function scanImports(ctx, _workspaces) {
  /** @type {Module[]} */
  const modules = [];
  /** @type {Map<string, { decls: Set<string>, defaultMembers: Map<string, string> }>} */
  const internal = new Map();
  for (const path of ctx.files) {
    if (!ctx.isSource(path)) continue;
    const { module, decls, defaultMembers } = extractModule(ctx, path);
    modules.push(module);
    internal.set(path, { decls, defaultMembers });
  }
  modules.sort((a, b) => cmp(a.path, b.path));
  const result = /** @type {ImportsResult} */ ({ modules });
  // Lookup tables are not part of the JSON output.
  Object.defineProperty(result, 'byPath', {
    value: new Map(modules.map(m => [m.path, m])),
    enumerable: false,
  });
  Object.defineProperty(result, 'internal', { value: internal, enumerable: false });
  return result;
}

/** @type {WeakMap<object, Map<string, Module>>} */
const indexCache = new WeakMap();

/**
 * @param {any} graph ImportsResult, `{ modules }`, or an array of modules
 * @returns {Map<string, Module>}
 */
export function moduleIndex(graph) {
  if (graph.byPath instanceof Map) return graph.byPath;
  let idx = indexCache.get(graph);
  if (!idx) {
    const list = Array.isArray(graph) ? graph : graph.modules;
    idx = new Map(list.map((/** @type {Module} */ m) => [m.path, m]));
    indexCache.set(graph, idx);
  }
  return idx;
}

const CLOSURE_KINDS = new Set(['static', 'dynamic', 'require', 'reexport', 'side_effect']);

/**
 * Files reachable from the start paths. Mock edges are never followed.
 * @param {any} graph
 * @param {Iterable<string>} startPaths
 * @param {{ includeTypeOnly?: boolean }} [opts]
 * @returns {Set<string>}
 */
export function closure(graph, startPaths, { includeTypeOnly = false } = {}) {
  const index = moduleIndex(graph);
  /** @type {Set<string>} */
  const seen = new Set();
  const stack = [...startPaths];
  for (const s of stack) seen.add(s);
  while (stack.length) {
    const p = /** @type {string} */ (stack.pop());
    const mod = index.get(p);
    if (!mod) continue;
    for (const e of mod.imports) {
      if (!e.target || !CLOSURE_KINDS.has(e.kind)) continue;
      if (e.typeOnly && !includeTypeOnly) continue;
      if (!seen.has(e.target)) {
        seen.add(e.target);
        stack.push(e.target);
      }
    }
  }
  return seen;
}

/**
 * Follow re-exports to the module that declares an export.
 * @param {any} graph
 * @param {string} path
 * @param {string} name
 * @param {Set<string>} [seen]
 * @returns {{ path: string, name: string } | null}
 */
export function resolveExport(graph, path, name, seen = new Set()) {
  const key = `${path}\0${name}`;
  if (seen.has(key)) return null;
  seen.add(key);
  const mod = moduleIndex(graph).get(path);
  if (!mod) return null;
  const entry = mod.exports.find(e => e.name === name);
  if (entry) {
    if (entry.kind === 'reexport') {
      if (entry.from === null) return { path, name };
      if (entry.original === '*' || entry.original === null)
        return { path: entry.from, name: '*' };
      return (
        resolveExport(graph, entry.from, entry.original, seen) ?? {
          path: entry.from,
          name: entry.original,
        }
      );
    }
    return { path, name };
  }
  if (name !== 'default') {
    for (const star of mod.starReexports) {
      const r = resolveExport(graph, star, name, seen);
      if (r) return r;
    }
  }
  return null;
}
