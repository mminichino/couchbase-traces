#!/usr/bin/env node
// Command dispatch: scan [--check], render.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { scanBranding } from './lib/branding.mjs';
import {
  createContext,
  EXIT,
  EXIT_NAMES,
  ExitError,
  isSourcePath,
  isTestPath,
  summarizeWarnings,
} from './lib/context.mjs';
import { scanDataLayer } from './lib/datalayer.mjs';
import { scanEntryPoints } from './lib/entrypoints.mjs';
import { skeleton, validateFeatures } from './lib/features.mjs';
import { scanImports } from './lib/imports.mjs';
import { scanIngestion } from './lib/ingestion.mjs';
import { stableJson, writeAtomic } from './lib/jsonout.mjs';
import { computeParity } from './lib/parity.mjs';
import { checkPlan } from './lib/plancheck.mjs';
import {
  PHASE2_END,
  PHASE2_START,
  renderNotesBlock,
  renderParityMd,
  replaceBlock,
} from './lib/render.mjs';
import { scanSchema } from './lib/schema.mjs';
import { scanSql } from './lib/sqlcatalog.mjs';
import { scanTests } from './lib/tests.mjs';
import { scanWorkspaces } from './lib/workspaces.mjs';

const USAGE = `Usage:
  cli.mjs scan [--check] --root <dir> [--quiet]
  cli.mjs render --root <dir> [--quiet]
  cli.mjs --help
`;

const STATE_DIR = 'port/state/inventory';
const ALLOWED_PREFIXES = ['port/'];
const ALLOWED_FILES = new Set(['docs/parity.md', 'docs/port-notes.md', 'AGENTS.md']);

/**
 * @typedef {{ command: 'scan' | 'render', check: boolean, root: string, quiet: boolean }} Args
 */

/**
 * @param {string[]} argv
 * @returns {Args | { help: true }}
 */
function parseArgs(argv) {
  /** @type {string | null} */
  let command = null;
  let check = false;
  /** @type {string | null} */
  let root = null;
  let quiet = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') return { help: true };
    if (a === '--check') check = true;
    else if (a === '--quiet') quiet = true;
    else if (a === '--root') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new ExitError(EXIT.USAGE, '--root requires a directory');
      root = v;
    } else if (a.startsWith('--')) {
      throw new ExitError(EXIT.USAGE, `Unknown flag: ${a}`);
    } else if (command === null && (a === 'scan' || a === 'render')) {
      command = a;
    } else {
      throw new ExitError(EXIT.USAGE, `Unknown command: ${a}`);
    }
  }
  if (command === null) throw new ExitError(EXIT.USAGE, 'A command is required: scan or render');
  if (check && command !== 'scan') throw new ExitError(EXIT.USAGE, '--check applies to scan only');
  if (root === null) throw new ExitError(EXIT.USAGE, '--root <dir> is required');
  return { command: /** @type {'scan' | 'render'} */ (command), check, root, quiet };
}

/**
 * @param {string} root
 * @param {string[]} args
 */
function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

/**
 * Paths outside the allowed set.
 * @param {string[]} paths
 */
function disallowed(paths) {
  return [...new Set(paths)].filter(
    p => p && !ALLOWED_PREFIXES.some(a => p.startsWith(a)) && !ALLOWED_FILES.has(p),
  );
}

/**
 * Section 6 preconditions.
 * @param {string} root
 * @returns {{ importCommit: string, headCommit: string }}
 */
function checkPreconditions(root) {
  const importJson = join(root, 'port/state/import.json');
  if (!existsSync(importJson)) {
    throw new ExitError(EXIT.STATE_MISSING, 'port/state/import.json is missing');
  }
  let status;
  try {
    status = JSON.parse(readFileSync(importJson, 'utf8')).status;
  } catch {
    throw new ExitError(EXIT.STATE_MISSING, 'port/state/import.json is not valid JSON');
  }
  if (status !== 'pass') {
    throw new ExitError(EXIT.STATE_MISSING, `port/state/import.json status is ${JSON.stringify(status)}, not pass`);
  }

  let log;
  try {
    log = git(root, ['log', '--format=%H%x09%s', 'HEAD']);
  } catch {
    throw new ExitError(EXIT.STATE_MISMATCH, 'HEAD has no commit history');
  }
  let importCommit = '';
  for (const line of log.split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) continue;
    if (line.slice(tab + 1).startsWith('Import HyperDX at ')) {
      importCommit = line.slice(0, tab);
      break;
    }
  }
  if (!importCommit) {
    throw new ExitError(EXIT.STATE_MISMATCH, 'No commit with a subject starting "Import HyperDX at " in HEAD history');
  }
  const headCommit = git(root, ['rev-parse', 'HEAD']).trim();

  const changed = git(root, ['diff', '--name-only', '-z', importCommit, 'HEAD']).split('\0');
  const entries = git(root, ['status', '--porcelain', '-z', '--untracked-files=no']).split('\0');
  /** @type {string[]} */
  const dirty = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.length < 4) continue;
    dirty.push(e.slice(3));
    if (e[0] === 'R' || e[0] === 'C' || e[1] === 'R' || e[1] === 'C') {
      i++;
      if (entries[i]) dirty.push(entries[i]);
    }
  }
  const bad = disallowed([...changed, ...dirty]).sort();
  if (bad.length > 0) {
    const shown = bad.slice(0, 20).join(', ');
    throw new ExitError(
      EXIT.STATE_MISMATCH,
      `${bad.length} path(s) outside port/, docs/parity.md, docs/port-notes.md, and AGENTS.md changed since ${importCommit.slice(0, 12)}: ${shown}${bad.length > 20 ? ', ...' : ''}`,
    );
  }
  return { importCommit, headCommit };
}

/**
 * @param {string} root
 * @param {string} rel
 * @returns {any}
 */
function readJsonFile(root, rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'));
}

/**
 * Manifest with the volatile fields removed.
 * @param {string} text
 */
function manifestForCompare(text) {
  const m = JSON.parse(text);
  delete m.generatedAt;
  delete m.headCommit;
  return stableJson(m);
}

/**
 * @param {string} root
 * @param {string} block
 */
function writeNotes(root, block) {
  const path = join(root, 'docs/port-notes.md');
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '# Port notes\n';
  const next = replaceBlock(existing, PHASE2_START, PHASE2_END, block);
  if (next !== existing || !existsSync(path)) writeAtomic(path, next.endsWith('\n') ? next : next + '\n');
}

/**
 * @param {Args} args
 * @param {{ log(msg: string): void, err(msg: string): void }} io
 */
function runScan(args, io) {
  const root = args.root;
  const { importCommit, headCommit } = checkPreconditions(root);
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

  /** @type {Record<string, unknown>} */
  const outputs = {
    'branding.json': branding,
    'datalayer.json': { modules: data.modules },
    'entrypoints.json': { entryPoints: entry.entryPoints },
    'imports.json': { modules: imports.modules },
    'ingestion.json': ingestion,
    'plan-check.json': plan,
    'schema.json': schema,
    'sql-catalog.json': sql,
    'tests.json': tests,
    'workspaces.json': { workspaces: workspaces.workspaces },
  };

  let sourceFiles = 0;
  let testFiles = 0;
  for (const f of ctx.files) {
    if (isSourcePath(f)) {
      if (isTestPath(f)) testFiles++;
      else sourceFiles++;
    }
  }
  const warnings = summarizeWarnings(ctx.warnings);
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    importCommit,
    headCommit,
    files: Object.keys(outputs).sort(),
    counts: {
      trackedFiles: ctx.files.length,
      sourceFiles,
      testFiles,
      entryPoints: entry.entryPoints.length,
      dataLayerModules: data.modules.length,
      unmappedConstructs: sql.constructs.filter(c => c.classification === 'unmapped').length,
      tables: schema.tables.length,
      brandingHits: branding.hits.length,
    },
    warnings,
  };
  const texts = new Map(Object.entries(outputs).map(([k, v]) => [k, stableJson(v)]));
  texts.set('manifest.json', stableJson(manifest));

  if (args.check) {
    /** @type {string[]} */
    const differing = [];
    for (const [name, text] of [...texts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      const p = join(root, STATE_DIR, name);
      if (!existsSync(p)) {
        differing.push(name);
        continue;
      }
      const disk = readFileSync(p, 'utf8');
      if (name === 'manifest.json') {
        let same = false;
        try {
          same = manifestForCompare(disk) === manifestForCompare(text);
        } catch {
          same = false;
        }
        if (!same) differing.push(name);
      } else if (disk !== text) differing.push(name);
    }
    if (differing.length > 0) {
      throw new ExitError(EXIT.STALE, `Inventory is stale; differing files: ${differing.join(', ')}. Run port/inventory.sh scan.`);
    }
    io.log(`Inventory is current (${manifest.counts.entryPoints} entry points).`);
    return 0;
  }

  try {
    for (const [name, text] of texts) writeAtomic(join(root, STATE_DIR, name), text);
    const featuresPath = join(root, 'port/features.json');
    if (!existsSync(featuresPath)) {
      writeAtomic(featuresPath, stableJson(skeleton(entry.entryPoints)));
      io.log('Wrote port/features.json skeleton.');
    }
    const parityPath = join(root, STATE_DIR, 'parity.json');
    const parity = existsSync(parityPath) ? readJsonFile(root, `${STATE_DIR}/parity.json`) : undefined;
    const block = renderNotesBlock({
      importCommit,
      workspaces: workspaces.workspaces,
      entryPoints: entry.entryPoints,
      dataLayer: data.modules,
      sql,
      schema,
      ingestion,
      tests,
      branding,
      planCheck: plan,
      warnings,
      parity,
    });
    writeNotes(root, block);
  } catch (err) {
    if (err instanceof ExitError) throw err;
    throw new ExitError(EXIT.REPORT_WRITE, `Cannot write output: ${err instanceof Error ? err.message : String(err)}`);
  }
  const c = manifest.counts;
  io.log(
    `Scanned ${c.trackedFiles} files: ${c.entryPoints} entry points, ${c.dataLayerModules} data-layer modules, ${c.unmappedConstructs} unmapped constructs, ${c.tables} tables, ${c.brandingHits} branding hits.`,
  );
  for (const w of warnings) io.log(`warning ${w.code}: ${w.count} (first: ${w.first})`);
  return 0;
}

/**
 * @param {Args} args
 * @param {{ log(msg: string): void, err(msg: string): void }} io
 */
function runRender(args, io) {
  const root = args.root;
  checkPreconditions(root);

  const featuresPath = join(root, 'port/features.json');
  if (!existsSync(featuresPath)) {
    throw new ExitError(EXIT.FEATURES_INVALID, 'port/features.json does not exist; run port/inventory.sh scan');
  }
  /** @type {any} */
  let featuresFile;
  try {
    featuresFile = JSON.parse(readFileSync(featuresPath, 'utf8'));
  } catch (err) {
    throw new ExitError(
      EXIT.FEATURES_INVALID,
      `port/features.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  /** @param {string} name */
  const load = name => {
    const rel = `${STATE_DIR}/${name}`;
    if (!existsSync(join(root, rel))) {
      throw new ExitError(EXIT.STATE_MISSING, `${rel} is missing; run port/inventory.sh scan`);
    }
    return readJsonFile(root, rel);
  };
  const manifest = load('manifest.json');
  const entry = load('entrypoints.json');
  const imports = load('imports.json');
  const data = load('datalayer.json');
  const tests = load('tests.json');
  const workspaces = load('workspaces.json');
  const sql = load('sql-catalog.json');
  const schema = load('schema.json');
  const ingestion = load('ingestion.json');
  const branding = load('branding.json');
  const plan = load('plan-check.json');

  const errors = validateFeatures(featuresFile, entry.entryPoints);
  if (errors.length > 0) {
    for (const e of errors) io.err(`  ${e}`);
    throw new ExitError(EXIT.FEATURES_INVALID, `port/features.json has ${errors.length} error(s)`);
  }

  const ctx = createContext(root);
  const parity = computeParity(featuresFile, entry.entryPoints, imports, data, tests, ctx.files);

  try {
    writeAtomic(join(root, STATE_DIR, 'parity.json'), stableJson(parity));
    writeAtomic(join(root, 'docs/parity.md'), renderParityMd(parity, featuresFile));
    writeNotes(
      root,
      renderNotesBlock({
        importCommit: manifest.importCommit,
        workspaces: workspaces.workspaces,
        entryPoints: entry.entryPoints,
        dataLayer: data.modules,
        sql,
        schema,
        ingestion,
        tests,
        branding,
        planCheck: plan,
        warnings: manifest.warnings,
        parity,
      }),
    );
  } catch (err) {
    if (err instanceof ExitError) throw err;
    throw new ExitError(EXIT.REPORT_WRITE, `Cannot write output: ${err instanceof Error ? err.message : String(err)}`);
  }
  io.log(`Rendered ${parity.totals.features} features covering ${parity.totals.entryPoints} entry points.`);
  return 0;
}

/**
 * Run the CLI. Returns the exit code.
 * @param {string[]} argv
 * @param {{ log(msg: string): void, err(msg: string): void }} [io]
 * @returns {number}
 */
export function run(argv, io) {
  const quietFlag = argv.includes('--quiet');
  const out = io ?? {
    log: (/** @type {string} */ m) => {
      if (!quietFlag) process.stdout.write(m + '\n');
    },
    err: (/** @type {string} */ m) => process.stderr.write(m + '\n'),
  };
  try {
    const args = parseArgs(argv);
    if ('help' in args) {
      process.stdout.write(USAGE);
      return 0;
    }
    const root = resolve(args.root);
    if (!existsSync(root) || !statSync(root).isDirectory()) {
      throw new ExitError(EXIT.CONFIG, `--root is not a directory: ${args.root}`);
    }
    try {
      const inside = git(root, ['rev-parse', '--is-inside-work-tree']).trim();
      if (inside !== 'true') throw new Error('not a work tree');
    } catch {
      throw new ExitError(EXIT.CONFIG, `--root is not a git work tree: ${args.root}`);
    }
    args.root = root;
    return args.command === 'scan' ? runScan(args, out) : runRender(args, out);
  } catch (err) {
    if (err instanceof ExitError) {
      out.err(`${EXIT_NAMES[/** @type {keyof typeof EXIT_NAMES} */ (err.exitCode)] ?? 'E_ERROR'}: ${err.message}`);
      if (err.exitCode === EXIT.USAGE) out.err(USAGE);
      return err.exitCode;
    }
    out.err(`E_INTERNAL: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
    return EXIT.INTERNAL;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  process.exitCode = run(process.argv.slice(2));
}
