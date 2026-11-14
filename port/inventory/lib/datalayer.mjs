// Data-layer module set, exports, and callers.
import { cmp } from './context.mjs';
import { resolveExport } from './imports.mjs';
import { ROLE, workspaceByRole, workspaceOf } from './workspaces.mjs';

/**
 * @typedef {{ path: string, workspace: string, reasons: string[],
 *   exports: { name: string, kind: string }[],
 *   importers: { path: string, workspace: string, test: boolean, typeOnly: boolean,
 *     symbols: { name: string, references: number, lines: number[] }[] }[],
 *   serverSide: boolean }} DataLayerModule
 */

/** Seed paths. A trailing slash means every file under that directory. */
export const SEED_PATHS = [
  'packages/common-utils/src/queryParser.ts',
  'packages/common-utils/src/core/renderChartConfig.ts',
  'packages/common-utils/src/core/metadata.ts',
  'packages/common-utils/src/types.ts',
  'packages/common-utils/src/couchbase/',
];

/**
 * @param {string} path
 * @param {unknown} [_ctx]
 */
export function isSeedPath(path, _ctx) {
  for (const s of SEED_PATHS) {
    if (s.endsWith('/') ? path.startsWith(s) : path === s) return true;
  }
  return false;
}

/** @param {{ imports: { external: string | null }[] }} mod */
export function hasClickhouseClient(mod) {
  return mod.imports.some(e => e.external !== null && e.external.startsWith('@clickhouse/'));
}

/**
 * @param {string} path
 */
function hasClickhouseName(path) {
  const segs = path.split('/');
  const base = segs[segs.length - 1];
  const dot = base.lastIndexOf('.');
  segs[segs.length - 1] = dot > 0 ? base.slice(0, dot) : base;
  return segs.some(s => s.toLowerCase().includes('clickhouse'));
}

/**
 * @param {import('./context.mjs').Ctx} ctx
 * @param {any} importsResult
 * @param {{ sqlBearingLiterals: { path: string, count: number }[] }} sqlCatalog
 * @returns {{ modules: DataLayerModule[] }}
 */
export function scanDataLayer(ctx, importsResult, sqlCatalog) {
  const ts = ctx.ts;
  const api = workspaceByRole(ctx, ROLE.API);

  for (const s of SEED_PATHS) {
    const exists = s.endsWith('/')
      ? ctx.files.some(f => f.startsWith(s))
      : ctx.fileSet.has(s);
    if (!exists) ctx.warn('W_SEED_MISSING', `Seed path not found: ${s}`, s);
  }

  /** @type {Map<string, number>} */
  const literalCounts = new Map(sqlCatalog.sqlBearingLiterals.map(l => [l.path, l.count]));

  /** @type {Map<string, string[]>} */
  const reasons = new Map();
  for (const path of ctx.files) {
    if (!ctx.isSource(path) || ctx.isTest(path)) continue;
    const mod = importsResult.byPath.get(path);
    const r = [];
    if (isSeedPath(path)) r.push('seed');
    if (mod && hasClickhouseClient(mod)) r.push('clickhouse_client');
    if (hasClickhouseName(path)) r.push('clickhouse_path');
    if ((literalCounts.get(path) ?? 0) >= 3) r.push('sql_builder');
    if (r.length) reasons.set(path, r);
  }
  const dl = new Set(reasons.keys());

  // ---- Collect uses ------------------------------------------------------
  /**
   * @typedef {{ owner: string, importer: string, typeOnly: boolean, name: string | null,
   *   local: string | null, line: number, namespaceOf: string | null }} Use
   */
  /** @type {Use[]} */
  const uses = [];
  /** @type {Map<string, Set<string>>} */
  const neededLocals = new Map();
  /** @type {Map<string, Set<string>>} */
  const neededNamespaces = new Map();

  /** @param {string} importer @param {string} local @param {boolean} ns */
  const need = (importer, local, ns) => {
    const m = ns ? neededNamespaces : neededLocals;
    const set = m.get(importer) ?? new Set();
    set.add(local);
    m.set(importer, set);
  };

  for (const mod of importsResult.modules) {
    for (const e of mod.imports) {
      if (!e.target || e.kind === 'mock') continue;
      const T = e.target;
      const targetIsDl = dl.has(T);
      if (e.kind === 'reexport') {
        if (!targetIsDl) continue;
        if (e.bindings.length === 0) {
          uses.push({ owner: T, importer: mod.path, typeOnly: e.typeOnly, name: null, local: null, line: e.line, namespaceOf: null });
        }
        for (const b of e.bindings) {
          uses.push({ owner: T, importer: mod.path, typeOnly: e.typeOnly, name: b.imported, local: null, line: e.line, namespaceOf: null });
        }
        // A re-export of a re-export still reaches the declaring module.
        continue;
      }
      if (e.bindings.length === 0) {
        if (targetIsDl) {
          uses.push({ owner: T, importer: mod.path, typeOnly: e.typeOnly, name: null, local: null, line: e.line, namespaceOf: null });
        }
        continue;
      }
      for (const b of e.bindings) {
        if (b.imported === '*') {
          // Resolved once member accesses are known.
          uses.push({ owner: T, importer: mod.path, typeOnly: e.typeOnly, name: '*', local: b.local, line: e.line, namespaceOf: T });
          need(mod.path, b.local, true);
          continue;
        }
        const owners = [];
        if (targetIsDl) owners.push({ path: T, name: b.imported });
        const r = resolveExport(importsResult, T, b.imported);
        if (r && r.path !== T && dl.has(r.path) && r.name !== '*') {
          owners.push({ path: r.path, name: r.name });
        }
        for (const o of owners) {
          uses.push({ owner: o.path, importer: mod.path, typeOnly: e.typeOnly, name: o.name, local: b.local, line: e.line, namespaceOf: null });
          need(mod.path, b.local, false);
        }
      }
    }
  }

  // ---- Count references per importer --------------------------------------
  /** @type {Map<string, { idents: Map<string, { count: number, lines: number[] }>, access: Map<string, Map<string, { count: number, lines: number[] }>> }>} */
  const refs = new Map();
  const importerPaths = new Set([...neededLocals.keys(), ...neededNamespaces.keys()]);
  for (const importer of [...importerPaths].sort(cmp)) {
    const locals = neededLocals.get(importer) ?? new Set();
    const namespaces = neededNamespaces.get(importer) ?? new Set();
    const text = ctx.read(importer);
    if (!text) continue;
    const sf = ctx.parse(importer, text);
    /** @type {Map<string, { count: number, lines: number[] }>} */
    const idents = new Map();
    /** @type {Map<string, Map<string, { count: number, lines: number[] }>>} */
    const access = new Map();
    /** @param {Map<string, any>} m @param {string} k @param {number} line */
    const bump = (m, k, line) => {
      const cur = m.get(k) ?? { count: 0, lines: [] };
      cur.count++;
      if (cur.lines.length < 20 && !cur.lines.includes(line)) cur.lines.push(line);
      m.set(k, cur);
    };
    /** @param {import('typescript').Node} node */
    const visit = node => {
      if (
        ts.isImportDeclaration(node) ||
        ts.isImportEqualsDeclaration(node) ||
        (ts.isExportDeclaration(node) && node.moduleSpecifier)
      )
        return;
      if (ts.isIdentifier(node)) {
        if (locals.has(node.text) || namespaces.has(node.text)) {
          bump(idents, node.text, sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1);
        }
      } else if (
        ts.isPropertyAccessExpression(node) &&
        ts.isIdentifier(node.expression) &&
        namespaces.has(node.expression.text)
      ) {
        const m = access.get(node.expression.text) ?? new Map();
        bump(m, node.name.text, sf.getLineAndCharacterOfPosition(node.name.getStart(sf)).line + 1);
        access.set(node.expression.text, m);
      } else if (
        ts.isQualifiedName(node) &&
        ts.isIdentifier(node.left) &&
        namespaces.has(node.left.text)
      ) {
        const m = access.get(node.left.text) ?? new Map();
        bump(m, node.right.text, sf.getLineAndCharacterOfPosition(node.right.getStart(sf)).line + 1);
        access.set(node.left.text, m);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
    refs.set(importer, { idents, access });
  }

  // ---- Aggregate ---------------------------------------------------------
  /** @type {Map<string, Map<string, { typeOnly: boolean, symbols: Map<string, { references: number, lines: number[] }> }>>} */
  const byOwner = new Map();
  /**
   * @param {string} owner @param {string} importer @param {boolean} typeOnly
   * @param {string | null} name @param {number} references @param {number[]} lines
   */
  const add = (owner, importer, typeOnly, name, references, lines) => {
    let imap = byOwner.get(owner);
    if (!imap) byOwner.set(owner, (imap = new Map()));
    let entry = imap.get(importer);
    if (!entry) imap.set(importer, (entry = { typeOnly: true, symbols: new Map() }));
    if (!typeOnly) entry.typeOnly = false;
    if (name !== null) {
      const sym = entry.symbols.get(name) ?? { references: 0, lines: [] };
      sym.references += references;
      for (const l of lines) if (sym.lines.length < 20 && !sym.lines.includes(l)) sym.lines.push(l);
      entry.symbols.set(name, sym);
    }
  };

  for (const u of uses) {
    const info = refs.get(u.importer);
    if (u.name === '*' && u.local !== null && u.namespaceOf !== null) {
      const members = info?.access.get(u.local);
      let accessed = 0;
      if (members) {
        for (const [member, d] of members) {
          accessed += d.count;
          if (dl.has(u.namespaceOf)) add(u.namespaceOf, u.importer, u.typeOnly, member, d.count, d.lines);
          const r = resolveExport(importsResult, u.namespaceOf, member);
          if (r && r.path !== u.namespaceOf && dl.has(r.path) && r.name !== '*') {
            add(r.path, u.importer, u.typeOnly, r.name, d.count, d.lines);
          }
        }
      }
      const total = info?.idents.get(u.local);
      const rest = total ? Math.max(0, total.count - accessed) : 0;
      if (dl.has(u.namespaceOf)) {
        if (rest > 0 || !members) add(u.namespaceOf, u.importer, u.typeOnly, '*', rest, total ? total.lines : []);
        else add(u.namespaceOf, u.importer, u.typeOnly, null, 0, []);
      }
      continue;
    }
    if (u.local !== null) {
      const d = info?.idents.get(u.local);
      add(u.owner, u.importer, u.typeOnly, u.name, d ? d.count : 0, d ? d.lines : []);
    } else {
      add(u.owner, u.importer, u.typeOnly, u.name, 0, u.name !== null ? [u.line] : []);
    }
  }

  // ---- Output ------------------------------------------------------------
  const apiName = api ? api.name : null;
  /** @type {DataLayerModule[]} */
  const modules = [];
  for (const path of [...dl].sort(cmp)) {
    const mod = importsResult.byPath.get(path);
    const ws = workspaceOf(ctx, path);
    const imap = byOwner.get(path) ?? new Map();
    const importers = [...imap.entries()]
      .filter(([p]) => p !== path)
      .sort((a, b) => cmp(a[0], b[0]))
      .map(([p, entry]) => {
        const w = workspaceOf(ctx, p);
        return {
          path: p,
          workspace: w ? w.name : '',
          test: ctx.isTest(p),
          typeOnly: entry.typeOnly,
          symbols: [...entry.symbols.entries()]
            .sort((a, b) => cmp(a[0], b[0]))
            .map(([name, s]) => ({
              name,
              references: s.references,
              lines: s.lines.slice().sort((x, y) => x - y),
            })),
        };
      });
    const wsName = ws ? ws.name : '';
    modules.push({
      path,
      workspace: wsName,
      reasons: /** @type {string[]} */ (reasons.get(path)),
      exports: mod ? mod.exports.map((/** @type {any} */ e) => ({ name: e.name, kind: e.kind })) : [],
      importers,
      serverSide:
        apiName !== null &&
        (wsName === apiName || importers.some(i => !i.test && i.workspace === apiName)),
    });
  }
  return { modules };
}
