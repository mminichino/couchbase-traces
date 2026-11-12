// Shared helpers for the inventory test suites.
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanBranding } from '../lib/branding.mjs';
import { createContext } from '../lib/context.mjs';
import { scanDataLayer } from '../lib/datalayer.mjs';
import { scanEntryPoints } from '../lib/entrypoints.mjs';
import { scanImports } from '../lib/imports.mjs';
import { scanIngestion } from '../lib/ingestion.mjs';
import { checkPlan } from '../lib/plancheck.mjs';
import { scanSchema } from '../lib/schema.mjs';
import { scanSql } from '../lib/sqlcatalog.mjs';
import { scanTests } from '../lib/tests.mjs';
import { scanWorkspaces } from '../lib/workspaces.mjs';

const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURE = join(here, 'fixtures', 'repo');
export const PROJECT_ROOT = join(here, '..', '..', '..');
export const CLI = join(here, '..', 'cli.mjs');
export const IMPORT_SUBJECT = 'Import HyperDX at 0123456789ab';

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
 * Copy the fixture to a temp directory, apply changes, init git, and commit.
 * @param {{ files?: Record<string, string>, remove?: string[], message?: string }} [opts]
 * @returns {string} root
 */
export function makeRepo({ files = {}, remove = [], message = IMPORT_SUBJECT } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'inventory-'));
  cpSync(FIXTURE, root, { recursive: true });
  for (const r of remove) rmSync(join(root, r), { recursive: true, force: true });
  for (const [p, content] of Object.entries(files)) {
    const full = join(root, p);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  // Fixture sources need TypeScript from the project's node_modules.
  const nm = join(PROJECT_ROOT, 'node_modules');
  if (existsSync(nm)) symlinkSync(nm, join(root, 'node_modules'));
  git(root, ['init', '-q', '-b', 'main']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
  return root;
}

/** @param {string} root */
export function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

/**
 * Run every scanner against a root.
 * @param {string} root
 */
export function scanAll(root) {
  const ctx = createContext(root);
  const workspaces = scanWorkspaces(ctx);
  const imports = scanImports(ctx, workspaces);
  const entry = scanEntryPoints(ctx, imports);
  const sql = scanSql(ctx, imports);
  const data = scanDataLayer(ctx, imports, sql);
  const schema = scanSchema(ctx);
  const ingestion = scanIngestion(ctx, imports);
  const branding = scanBranding(ctx, imports, workspaces);
  const tests = scanTests(ctx, imports, entry.entryPoints);
  const plan = checkPlan(ctx, imports);
  return { ctx, workspaces, imports, entry, sql, data, schema, ingestion, branding, tests, plan };
}

/**
 * Run the CLI in a child process.
 * @param {string} root
 * @param {string[]} args
 */
export function cli(root, args) {
  const res = spawnSync(process.execPath, [CLI, ...args, '--root', root], { encoding: 'utf8' });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

/**
 * Warning codes recorded on a context.
 * @param {{ warnings: { code: string }[] }} ctx
 */
export function codes(ctx) {
  return ctx.warnings.map(w => w.code);
}
