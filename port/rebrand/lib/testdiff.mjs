// Substitution-only test diff check.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';

import { applyEnvRenamesToText } from './envvars.mjs';
import { git, isSourceFile, isTestFile } from './textfiles.mjs';
import { renameText } from './packages.mjs';
import { applyTokensToText, loadInventoryData, readTokenMap } from './tokens.mjs';
import { replaceUrlsInText } from './urls.mjs';
import { readPlan } from './report.mjs';

const BRAND_TEST_DIR = 'packages/app/src/brand/__tests__/';
const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/** @param {string} p */
function isSnapshot(p) {
  return p.endsWith('.snap');
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {string} base
 * @param {string} path
 * @returns {string | null}
 */
function showBase(ctx, base, path) {
  try {
    return git(ctx.root, ['show', `${base}:${path}`]);
  } catch {
    return null;
  }
}

/**
 * Direct relative imports of a source text.
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {string} path
 * @param {string} text
 * @returns {string[]} specifiers
 */
function relativeImports(ctx, path, text) {
  const ts = ctx.ts;
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, path.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  /** @type {string[]} */
  const out = [];
  /** @param {import('typescript').Node} n */
  const visit = n => {
    if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
      out.push(n.moduleSpecifier.text);
    } else if (ts.isCallExpression(n) && n.arguments.length > 0 && ts.isStringLiteral(n.arguments[0])) {
      const c = n.expression.getText(sf);
      if (c === 'require' || n.expression.kind === ts.SyntaxKind.ImportKeyword || /^(jest|vi)\.(mock|requireActual)$/.test(c)) out.push(n.arguments[0].text);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out.filter(s => s.startsWith('.') || s.startsWith('@/'));
}

/**
 * Resolve a relative specifier against the file list at the base commit.
 * @param {Set<string>} baseFiles
 * @param {string} from
 * @param {string} spec
 * @returns {string | null}
 */
function resolveBase(baseFiles, from, spec) {
  let target;
  if (spec.startsWith('@/')) {
    const m = /^(packages\/[^/]+)\//.exec(from);
    if (!m) return null;
    target = posix.normalize(`${m[1]}/src/${spec.slice(2)}`);
  } else target = posix.normalize(posix.join(dirname(from), spec));
  const cands = [target, ...EXTS.map(e => target + e), ...EXTS.map(e => `${target}/index${e}`)];
  return cands.find(c => baseFiles.has(c)) ?? null;
}

/**
 * Formatter of the repository: Prettier from its node_modules, or null when absent.
 * @param {string} root
 * @returns {((path: string, text: string) => string) | null}
 */
function repoFormatter(root) {
  const bin = join(root, 'node_modules/prettier/bin/prettier.cjs');
  if (!existsSync(bin)) return null;
  return (path, text) => {
    try {
      return execFileSync(process.execPath, [bin, '--stdin-filepath', path], { cwd: root, input: text, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    } catch {
      return text;
    }
  };
}

/**
 * Approved tokens replaced in every context, including identifiers such as object keys that
 * hold a renamed value. A key whose replacement is not a valid identifier is quoted.
 * @param {string} text
 * @param {Map<string, string>} approved
 */
function applyApprovedEverywhere(text, approved) {
  if (approved.size === 0) return text;
  const esc = (/** @type {string} */ s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tokens = [...approved.keys()].sort((a, b) => b.length - a.length).map(esc);
  const re = new RegExp(`(?<![A-Za-z0-9_$-])(${tokens.join('|')})(?![A-Za-z0-9_$-])`, 'g');
  return text.replace(re, (m, _t, offset) => {
    const repl = /** @type {string} */ (approved.get(m));
    const isKey = /^\s*:/.test(text.slice(offset + m.length)) && /[{,]\s*$/.test(text.slice(0, offset));
    return isKey && !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(repl) ? `'${repl}'` : repl;
  });
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {string} baseCommit
 * @param {{ format?: ((path: string, text: string) => string) | null }} [opts]
 * @returns {{ ok: boolean, problems: string[] }}
 */
export function testDiff(ctx, baseCommit, opts = {}) {
  // Longer names can make the formatter re-wrap lines, so the substituted base is formatted too.
  const format = opts.format === undefined ? repoFormatter(ctx.root) : opts.format;
  /** @type {string[]} */
  const problems = [];
  const plan = readPlan(ctx);
  const pkgRenames = plan?.packages?.renames ?? [];
  const envRenames = plan?.env?.renames ?? [];
  const map = readTokenMap(ctx) ?? { schemaVersion: 1, entries: [] };
  const data = loadInventoryData(ctx);
  const approved = new Map(map.entries.filter(e => e.status === 'approved').map(e => [e.token, /** @type {string} */ (e.replacement)]));

  const out = git(ctx.root, ['diff', '--name-status', '--no-renames', '-z', baseCommit]).split('\0');
  /** @type {{ status: string, path: string }[]} */
  const changes = [];
  for (let i = 0; i + 1 < out.length; i += 2) changes.push({ status: out[i], path: out[i + 1] });

  const baseFiles = new Set(git(ctx.root, ['ls-tree', '-r', '--name-only', '-z', baseCommit]).split('\0').filter(Boolean));
  const notes = ctx.exists('docs/port-notes.md') ? ctx.read('docs/port-notes.md') : '';
  const removedSection = /###\s+Removed integrations([\s\S]*?)(?=\n#{1,3}\s|<!--|$)/.exec(notes)?.[1] ?? '';

  for (const { status, path } of changes) {
    const testLike = isTestFile(path) || (isSnapshot(path) && /(^|\/)__snapshots__\//.test(path));
    if (!testLike) continue;
    // The port tooling is outside the rewrite; its tests change with the tool.
    if (path.startsWith('port/')) continue;
    if (status === 'D' || (status !== 'M' && !ctx.exists(path) && baseFiles.has(path))) {
      const baseText = showBase(ctx, baseCommit, path) ?? '';
      if (removedSection.includes(path)) continue;
      const imports = isSourceFile(path) ? relativeImports(ctx, path, baseText) : [];
      /** @type {string[]} */
      const resolved = [];
      for (const s of imports) {
        const r = resolveBase(baseFiles, path, s);
        if (r && !isTestFile(r) && !/(^|\/)(__mocks__|fixtures|__fixtures__)\//.test(r)) resolved.push(r);
      }
      const survivors = resolved.filter(r => ctx.exists(r));
      if (resolved.length === 0) problems.push(`${path}: deleted test imports no non-test module and is not listed under "Removed integrations"`);
      else if (survivors.length > 0) {
        problems.push(`${path}: deleted, but imported module(s) still exist: ${survivors.join(', ')}`);
      }
      continue;
    }
    if (status !== 'M') continue;
    if (path.startsWith(BRAND_TEST_DIR)) continue;
    // Tests of a removed integration lose the assertions on it.
    if (removedSection.includes(path)) continue;
    const baseText = showBase(ctx, baseCommit, path);
    if (baseText === null) continue;
    let expected = renameText(baseText, pkgRenames);
    expected = applyEnvRenamesToText(expected, envRenames);
    expected = applyTokensToText(ctx, path, expected, map, data);
    expected = replaceUrlsInText(ctx.names, expected);
    const current = ctx.read(path);
    if (expected !== current && format) expected = format(path, expected);
    if (expected !== current) {
      const loose = applyApprovedEverywhere(expected, approved);
      if (loose === current || (format && format(path, loose) === current)) continue;
    }
    if (expected !== current) {
      const el = expected.split('\n');
      const cl = current.split('\n');
      let i = 0;
      while (i < el.length && i < cl.length && el[i] === cl[i]) i++;
      problems.push(`${path}: differs from the substituted base at line ${i + 1}: expected ${JSON.stringify((el[i] ?? '').slice(0, 120))}, found ${JSON.stringify((cl[i] ?? '').slice(0, 120))}`);
    }
  }
  return { ok: problems.length === 0, problems };
}
