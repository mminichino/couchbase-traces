// Shared helpers for the rebrand test suites.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createContext } from '../lib/textfiles.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE = join(here, 'fixtures', 'repo');
export const PROJECT_ROOT = join(here, '..', '..', '..');
export const CLI = join(here, '..', 'cli.mjs');

/**
 * @param {string} root
 * @param {string[]} args
 */
export function git(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'Test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_CONFIG_SYSTEM: '/dev/null',
    },
  });
}

/**
 * Copy the fixture to a temp directory, apply changes, init git, commit.
 * @param {{ files?: Record<string, string | Buffer>, remove?: string[], message?: string, base?: boolean }} [opts]
 * @returns {string} root
 */
export function makeRepo({ files = {}, remove = [], message = 'Import HyperDX at 0123456789ab', base = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'rebrand-'));
  if (base) cpSync(FIXTURE, root, { recursive: true });
  else cpSync(join(FIXTURE, 'AGENTS.md'), join(root, 'AGENTS.md'));
  for (const r of remove) rmSync(join(root, r), { recursive: true, force: true });
  for (const [p, content] of Object.entries(files)) {
    const full = join(root, p);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  const nm = join(PROJECT_ROOT, 'node_modules');
  if (existsSync(nm)) symlinkSync(nm, join(root, 'node_modules'));
  writeFileSync(join(root, '.gitignore'), 'node_modules\n');
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
  return root;
}

/**
 * Write files (tracked or not) and commit everything.
 * @param {string} root
 * @param {Record<string, string | Buffer>} files
 * @param {string} message
 */
export function commitFiles(root, files, message) {
  for (const [p, content] of Object.entries(files)) {
    const full = join(root, p);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
}

/** @param {string} root @param {string} path */
export function read(root, path) {
  return readFileSync(join(root, path), 'utf8');
}

/** @param {string} root */
export function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

/** @param {string} root */
export function ctxOf(root) {
  return createContext(root);
}

/**
 * Run the CLI in a child process.
 * @param {string} root
 * @param {string[]} args
 */
export function cli(root, args) {
  const res = spawnSync(process.execPath, [CLI, ...args, '--root', root], {
    encoding: 'utf8',
    env: { ...process.env, YARN_ENABLE_IMMUTABLE_INSTALLS: 'false' },
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

/** Minimal valid PNG header with the given size. @param {number} w @param {number} h */
export function png(w, h) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'latin1');
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}

/** ICO with the given square sizes. @param {number[]} sizes */
export function ico(sizes) {
  const b = Buffer.alloc(6 + sizes.length * 16);
  b.writeUInt16LE(0, 0);
  b.writeUInt16LE(1, 2);
  b.writeUInt16LE(sizes.length, 4);
  sizes.forEach((s, i) => {
    b[6 + i * 16] = s >= 256 ? 0 : s;
    b[6 + i * 16 + 1] = s >= 256 ? 0 : s;
  });
  return b;
}

export const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20"><path d="M0 0h10v20z"/></svg>';

export const TOKENS = {
  brand: { 50: '#fff', 100: '#eee', 200: '#ddd', 300: '#ccc', 400: '#bbb', 500: '#aaa', 600: '#999', 700: '#888', 800: '#777', 900: '#666', base: '#abcdef' },
};

/** A complete asset set, as Buffers and strings keyed by path under branding/. */
export function goodAssets() {
  return {
    'branding/logomark.svg': SVG,
    'branding/wordmark-light.svg': SVG,
    'branding/wordmark-dark.svg': SVG,
    'branding/favicon.ico': ico([16, 32]),
    'branding/favicon-16x16.png': png(16, 16),
    'branding/favicon-32x32.png': png(32, 32),
    'branding/apple-touch-icon.png': png(180, 180),
    'branding/tokens.json': JSON.stringify(TOKENS),
  };
}
