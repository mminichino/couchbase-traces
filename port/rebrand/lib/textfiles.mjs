// Tracked text file listing, source contexts, safe rewriting.
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join } from 'node:path';

import { cmp, deriveNames, EXIT, ExitError, isExempt, isReviewedFile, readConstants } from './names.mjs';

const MAX_BYTES = 2 * 1024 * 1024;
const SOURCE_EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const EXCLUDED_SEGMENTS = new Set(['dist', 'build', '.next', 'coverage', 'node_modules']);
const TEST_SEGMENTS = new Set(['__tests__', '__mocks__', 'tests', 'e2e', 'smoke-tests', 'fixtures', 'mocks']);
const TEST_BASENAME = /\.(test|spec|int\.test|stories)\.[cm]?[jt]sx?$/;

/** @param {string} p */
export function extOf(p) {
  const base = basename(p);
  const i = base.lastIndexOf('.');
  return i <= 0 ? '' : base.slice(i);
}

/** Source files get AST contexts. Unlike the inventory, declaration files count. @param {string} p */
export function isSourceFile(p) {
  if (!SOURCE_EXT.has(extOf(p))) return false;
  for (const s of p.split('/')) if (EXCLUDED_SEGMENTS.has(s)) return false;
  return true;
}

/** Test file by Phase 2 rules. @param {string} p */
export function isTestFile(p) {
  if (!isSourceFile(p) || p.endsWith('.d.ts')) return false;
  const segs = p.split('/');
  for (let i = 0; i < segs.length - 1; i++) if (TEST_SEGMENTS.has(segs[i])) return true;
  return TEST_BASENAME.test(segs[segs.length - 1]);
}

/**
 * @typedef {{ root: string, ts: typeof import('typescript'), names: import('./names.mjs').Names,
 *   files: string[], warnings: { code: string, message: string, path: string | null }[],
 *   warn(code: string, message: string, path?: string | null): void,
 *   read(path: string): string, write(path: string, text: string): boolean,
 *   isText(path: string): boolean, textFiles(): string[], rewritable(): string[],
 *   exists(path: string): boolean, refresh(): void }} RCtx
 */

/**
 * @param {string} root
 * @param {string[]} args
 */
export function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
}

/**
 * @param {string} root
 * @param {{ names?: import('./names.mjs').Names }} [opts]
 * @returns {RCtx}
 */
export function createContext(root, opts = {}) {
  const names = opts.names ?? deriveNames(readConstants(root));
  /** @type {typeof import('typescript')} */
  let ts;
  try {
    ts = createRequire(join(root, 'package.json'))('typescript');
  } catch (err) {
    throw new ExitError(
      EXIT.CONFIG,
      `typescript cannot be loaded from ${root}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  /** @type {string[]} */
  let files = [];
  /** @type {Map<string, boolean>} */
  const textCache = new Map();
  /** @type {string[] | null} */
  let textList = null;

  const refresh = () => {
    let out;
    try {
      out = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 });
    } catch (err) {
      throw new ExitError(EXIT.CONFIG, `git ls-files failed in ${root}: ${err instanceof Error ? err.message : String(err)}`);
    }
    files = [...new Set(out.split('\0').filter(Boolean))].filter(p => existsSync(join(root, p))).sort(cmp);
    textCache.clear();
    textList = null;
  };
  refresh();

  /** @type {RCtx} */
  const ctx = {
    root,
    ts,
    names,
    get files() {
      return files;
    },
    warnings: [],
    warn(code, message, path) {
      ctx.warnings.push({ code, message, path: path ?? null });
    },
    read(path) {
      return readFileSync(join(root, path), 'utf8');
    },
    write(path, text) {
      return writeFileSafe(join(root, path), text);
    },
    exists(path) {
      return existsSync(join(root, path));
    },
    isText(path) {
      const c = textCache.get(path);
      if (c !== undefined) return c;
      let ok = false;
      try {
        const abs = join(root, path);
        const st = statSync(abs);
        if (st.isFile() && st.size < MAX_BYTES) {
          const fd = openSync(abs, 'r');
          try {
            const buf = Buffer.alloc(8192);
            const n = readSync(fd, buf, 0, 8192, 0);
            ok = true;
            for (let i = 0; i < n; i++) {
              if (buf[i] === 0) {
                ok = false;
                break;
              }
            }
          } finally {
            closeSync(fd);
          }
        }
      } catch {
        ok = false;
      }
      textCache.set(path, ok);
      return ok;
    },
    textFiles() {
      if (!textList) textList = files.filter(p => ctx.isText(p));
      return textList;
    },
    /** Text files that steps may modify. */
    rewritable() {
      return ctx.textFiles().filter(p => !isExempt(p) && !isReviewedFile(p));
    },
    refresh,
  };
  return ctx;
}

/**
 * Atomic write that keeps the file mode. Returns false when nothing changed.
 * @param {string} abs
 * @param {string} text
 */
export function writeFileSafe(abs, text) {
  let mode = 0o644;
  if (existsSync(abs)) {
    const old = readFileSync(abs, 'utf8');
    if (old === text) return false;
    mode = statSync(abs).mode & 0o777;
  }
  const dir = dirname(abs);
  mkdirSync(dir, { recursive: true });
  const tmp = join(dir, `.${basename(abs)}.${process.pid}.tmp`);
  try {
    writeFileSync(tmp, text);
    chmodSync(tmp, mode);
    renameSync(tmp, abs);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // ignore
    }
    throw err;
  }
  return true;
}

/**
 * Rewrite every rewritable text file with `fn(text, path)`. Files whose content is unchanged
 * are never written.
 * @param {RCtx} ctx
 * @param {(text: string, path: string) => string} fn
 * @param {{ only?: (path: string) => boolean }} [opts]
 * @returns {string[]} changed paths
 */
export function rewriteAll(ctx, fn, opts = {}) {
  /** @type {string[]} */
  const changed = [];
  for (const p of ctx.rewritable()) {
    if (opts.only && !opts.only(p)) continue;
    const text = ctx.read(p);
    const next = fn(text, p);
    if (next !== text && ctx.write(p, next)) changed.push(p);
  }
  return changed;
}

// ---------------------------------------------------------------------------
// Contexts

/** @typedef {'string' | 'identifier' | 'comment' | 'import_specifier' | 'text' | 'other'} CtxKind */
/** @typedef {{ start: number, end: number, kind: CtxKind }} Range */

const MODULE_CALLEES = new Set([
  'require',
  'jest.mock',
  'jest.doMock',
  'jest.unmock',
  'jest.requireActual',
  'jest.requireMock',
  'vi.mock',
  'vi.doMock',
  'vi.importActual',
]);

/** @param {import('typescript').SourceFile} sf @param {import('typescript').Node} node */
function calleeText(sf, node) {
  return node.getText(sf);
}

/**
 * AST contexts for a source file, sorted and disjoint by start.
 * Ranges for strings cover the full token including quotes.
 * @param {RCtx} ctx
 * @param {string} path
 * @param {string} text
 * @returns {Range[]}
 */
export function sourceRanges(ctx, path, text) {
  const ts = ctx.ts;
  const ext = extOf(path);
  let kind = ts.ScriptKind.TS;
  if (ext === '.tsx' || ext === '.jsx') kind = ts.ScriptKind.TSX;
  else if (ext === '.js' || ext === '.mjs' || ext === '.cjs') kind = ts.ScriptKind.JS;
  const sf = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  /** @type {Range[]} */
  const out = [];
  /** @type {Set<number>} */
  const commentSeen = new Set();
  const SK = ts.SyntaxKind;

  /** @param {number} pos */
  const addComments = pos => {
    for (const fn of [ts.getLeadingCommentRanges, ts.getTrailingCommentRanges]) {
      const rs = fn(text, pos);
      if (!rs) continue;
      for (const r of rs) {
        if (commentSeen.has(r.pos)) continue;
        commentSeen.add(r.pos);
        out.push({ start: r.pos, end: r.end, kind: 'comment' });
      }
    }
  };

  /** @param {import('typescript').Node} node */
  const isModuleSpecifier = node => {
    const p = node.parent;
    if (!p) return false;
    if ((ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) && p.moduleSpecifier === node) return true;
    if (ts.isExternalModuleReference(p)) return true;
    if (ts.isImportTypeNode(p)) return true;
    if (ts.isCallExpression(p) && p.arguments[0] === node) {
      if (p.expression.kind === SK.ImportKeyword) return true;
      if (MODULE_CALLEES.has(calleeText(sf, p.expression))) return true;
    }
    return false;
  };

  /** @param {import('typescript').Node} node */
  const visit = node => {
    const k = node.kind;
    const start = node.getStart(sf);
    if (k === SK.StringLiteral) {
      out.push({ start, end: node.end, kind: isModuleSpecifier(node) ? 'import_specifier' : 'string' });
    } else if (
      k === SK.NoSubstitutionTemplateLiteral ||
      k === SK.TemplateHead ||
      k === SK.TemplateMiddle ||
      k === SK.TemplateTail ||
      k === SK.JsxText ||
      // Regex literals match user-visible text, so they follow the string rules.
      k === SK.RegularExpressionLiteral
    ) {
      out.push({ start, end: node.end, kind: 'string' });
    } else if (k === SK.Identifier || k === SK.PrivateIdentifier) {
      out.push({ start, end: node.end, kind: 'identifier' });
    }
    if (k !== SK.JsxText) {
      if (node.pos !== node.end) addComments(node.pos);
      addComments(node.end);
    }
    if (k === SK.JsxExpression && !(/** @type {any} */ (node).expression)) {
      addComments(start + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  addComments(sf.endOfFileToken.pos);

  // Template heads/middles/tails include the `${` and `}` delimiters; narrowing is unnecessary
  // for brand terms, which never contain them.
  out.sort((a, b) => a.start - b.start || a.end - b.end);
  // Drop JSX text that was mistaken for a comment: comments never overlap strings.
  /** @type {Range[]} */
  const clean = [];
  for (const r of out) {
    if (r.kind === 'comment' && out.some(o => o.kind === 'string' && o.start <= r.start && o.end >= r.end)) continue;
    clean.push(r);
  }
  return clean;
}

/**
 * Context at a position. Unmatched positions in source files are 'other'.
 * @param {Range[] | null} ranges null for non-source text files
 * @param {number} pos
 * @returns {CtxKind}
 */
export function kindAt(ranges, pos) {
  if (!ranges) return 'text';
  let lo = 0;
  let hi = ranges.length - 1;
  /** @type {CtxKind} */
  let found = 'other';
  // Find the last range starting at or before pos, then check a few predecessors for nesting.
  let idx = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (ranges[mid].start <= pos) {
      idx = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  for (let i = idx; i >= 0 && i > idx - 8; i--) {
    const r = ranges[i];
    if (pos >= r.start && pos < r.end) {
      found = r.kind;
      break;
    }
  }
  return found;
}

/**
 * Line (1-based) of an offset.
 * @param {string} text
 * @param {number} offset
 */
export function lineOfOffset(text, offset) {
  let line = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < offset; i = text.indexOf('\n', i + 1)) line++;
  return line;
}

/**
 * Offsets of line starts, for repeated lookups.
 * @param {string} text
 */
export function lineIndex(text) {
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1; i = text.indexOf('\n', i + 1)) starts.push(i + 1);
  return /** @param {number} offset */ offset => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
}

/**
 * Trimmed text of the line containing the offset.
 * @param {string} text
 * @param {number} offset
 */
export function lineAt(text, offset) {
  const s = text.lastIndexOf('\n', offset - 1) + 1;
  let e = text.indexOf('\n', offset);
  if (e < 0) e = text.length;
  return text.slice(s, e).trim();
}
