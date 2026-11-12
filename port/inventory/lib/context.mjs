// Scanner context: root, git file list, TypeScript loader, warnings, exit codes.
import { execFileSync } from 'node:child_process';
import { closeSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

/**
 * @typedef {{ code: string, message: string, path: string | null }} Warning
 * @typedef {{ root: string, files: string[], fileSet: Set<string>, ts: typeof import('typescript'),
 *   warnings: Warning[], warn(code: string, message: string, path?: string | null): void,
 *   read(path: string): string, isTest(path: string): boolean, isSource(path: string): boolean,
 *   isBinary(path: string): boolean, parse(path: string, text?: string): import('typescript').SourceFile,
 *   cache: Map<string, any> }} Ctx
 */

export const EXIT = {
  USAGE: 2,
  CONFIG: 10,
  REPORT_WRITE: 50,
  STATE_MISSING: 60,
  STATE_MISMATCH: 61,
  INTERNAL: 70,
  TS_UNAVAILABLE: 100,
  FEATURES_INVALID: 101,
  STALE: 102,
};

export const EXIT_NAMES = {
  2: 'E_USAGE',
  10: 'E_CONFIG',
  50: 'E_REPORT_WRITE',
  60: 'E_STATE_MISSING',
  61: 'E_STATE_MISMATCH',
  70: 'E_INTERNAL',
  100: 'E_TS_UNAVAILABLE',
  101: 'E_FEATURES_INVALID',
  102: 'E_STALE',
};

/** Error that carries a process exit code. */
export class ExitError extends Error {
  /**
   * @param {number} exitCode
   * @param {string} message
   */
  constructor(exitCode, message) {
    super(message);
    this.exitCode = exitCode;
    this.name = 'ExitError';
  }
}

const SOURCE_EXT = new Set([
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);
const EXCLUDED_SEGMENTS = new Set([
  'dist',
  'build',
  '.next',
  'coverage',
  'node_modules',
]);
const TEST_SEGMENTS = new Set([
  '__tests__',
  '__mocks__',
  'tests',
  'e2e',
  'smoke-tests',
  'fixtures',
  'mocks',
]);
const TEST_BASENAME = /\.(test|spec|int\.test|stories)\.[cm]?[jt]sx?$/;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Outputs of this tool must not feed back into the scan, so they are left
 * out of the file universe.
 * @param {string} p
 */
export function isGeneratedPath(p) {
  return (
    p.startsWith('port/') ||
    p === 'docs/parity.md' ||
    p === 'docs/port-notes.md'
  );
}

/** @param {string} a @param {string} b */
export function cmp(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** @param {string} p */
export function extOf(p) {
  const base = p.slice(p.lastIndexOf('/') + 1);
  const i = base.lastIndexOf('.');
  return i <= 0 ? '' : base.slice(i);
}

/** @param {string} p */
export function baseOf(p) {
  return p.slice(p.lastIndexOf('/') + 1);
}

/** @param {string} p */
export function isSourcePath(p) {
  if (!SOURCE_EXT.has(extOf(p))) return false;
  if (p.endsWith('.d.ts')) return false;
  if (p.startsWith('port/')) return false;
  const segs = p.split('/');
  for (const s of segs) if (EXCLUDED_SEGMENTS.has(s)) return false;
  return true;
}

/**
 * Test-directory or test-name rules without the source-extension requirement.
 * @param {string} p
 */
export function isTestLikePath(p) {
  const segs = p.split('/');
  for (let i = 0; i < segs.length - 1; i++) {
    if (TEST_SEGMENTS.has(segs[i])) return true;
  }
  return TEST_BASENAME.test(segs[segs.length - 1]);
}

/** @param {string} p */
export function isTestPath(p) {
  return isSourcePath(p) && isTestLikePath(p);
}

/**
 * Warnings grouped by code, sorted by code.
 * @param {Warning[]} warnings
 * @returns {{ code: string, count: number, first: string }[]}
 */
export function summarizeWarnings(warnings) {
  const sorted = warnings
    .slice()
    .sort(
      (a, b) =>
        cmp(a.code, b.code) ||
        cmp(a.path ?? '', b.path ?? '') ||
        cmp(a.message, b.message),
    );
  /** @type {Map<string, { code: string, count: number, first: string }>} */
  const groups = new Map();
  for (const w of sorted) {
    const g = groups.get(w.code);
    if (g) g.count++;
    else {
      groups.set(w.code, {
        code: w.code,
        count: 1,
        first: w.path ? `${w.message} (${w.path})` : w.message,
      });
    }
  }
  return [...groups.values()];
}

/**
 * @param {string} root
 * @returns {string[]}
 */
export function gitFiles(root) {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: root,
    maxBuffer: 256 * 1024 * 1024,
    encoding: 'utf8',
  });
  return out.split('\0').filter(Boolean);
}

/**
 * Create the scanner context.
 * @param {string} root
 * @returns {Ctx}
 */
export function createContext(root) {
  root = resolve(root);

  /** @type {typeof import('typescript')} */
  let ts;
  try {
    ts = createRequire(join(root, 'package.json'))('typescript');
  } catch (err) {
    throw new ExitError(
      EXIT.TS_UNAVAILABLE,
      `typescript cannot be loaded from ${root}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let all;
  try {
    all = gitFiles(root);
  } catch (err) {
    throw new ExitError(
      EXIT.CONFIG,
      `git ls-files failed in ${root}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const files = [...new Set(all.filter(p => !isGeneratedPath(p)))].sort(cmp);
  const fileSet = new Set(files);

  /** @type {Warning[]} */
  const warnings = [];
  /** @type {Map<string, string>} */
  const texts = new Map();
  const tooLarge = new Set();

  /** @type {Ctx} */
  const ctx = {
    root,
    files,
    fileSet,
    ts,
    warnings,
    cache: new Map(),
    warn(code, message, path) {
      warnings.push({ code, message, path: path ?? null });
    },
    read(path) {
      const cached = texts.get(path);
      if (cached !== undefined) return cached;
      let text = '';
      const abs = join(root, path);
      try {
        const st = statSync(abs);
        if (!st.isFile()) {
          ctx.warn('W_FILE_UNREADABLE', 'Not a regular file', path);
        } else if (st.size > MAX_FILE_BYTES) {
          if (!tooLarge.has(path)) {
            tooLarge.add(path);
            ctx.warn(
              'W_FILE_TOO_LARGE',
              `File is ${st.size} bytes, over the 2 MB limit; skipped`,
              path,
            );
          }
        } else {
          text = readFileSync(abs, 'utf8');
        }
      } catch {
        ctx.warn('W_FILE_UNREADABLE', 'File could not be read', path);
      }
      // Keep the cache small: only retain text for small files read repeatedly.
      if (text.length < 200_000) texts.set(path, text);
      return text;
    },
    isTest: isTestPath,
    isSource: isSourcePath,
    isBinary(path) {
      let fd;
      try {
        fd = openSync(join(root, path), 'r');
        const buf = Buffer.alloc(8192);
        const n = readSync(fd, buf, 0, 8192, 0);
        for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
        return false;
      } catch {
        return false;
      } finally {
        if (fd !== undefined) closeSync(fd);
      }
    },
    parse(path, text) {
      const src = text ?? ctx.read(path);
      const ext = extOf(path);
      let kind = ts.ScriptKind.TS;
      if (ext === '.tsx' || ext === '.jsx') kind = ts.ScriptKind.TSX;
      else if (ext === '.js' || ext === '.mjs' || ext === '.cjs')
        kind = ts.ScriptKind.JS;
      return ts.createSourceFile(
        path,
        src,
        ts.ScriptTarget.Latest,
        true,
        kind,
      );
    },
  };
  return ctx;
}

/**
 * 1-based line of a node start.
 * @param {import('typescript').SourceFile} sf
 * @param {import('typescript').Node} node
 */
export function lineOf(sf, node) {
  return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}
