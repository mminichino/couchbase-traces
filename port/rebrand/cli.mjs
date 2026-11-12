#!/usr/bin/env node
// Command dispatch for the Phase 3 rebrand tool.
import { existsSync, realpathSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { ensureAllowlist, readAllowlist } from './lib/allowlist.mjs';
import { installAssets, validateAssets } from './lib/assets.mjs';
import { applyDocker } from './lib/docker.mjs';
import { applyEnvRenames, discoverEnvVars, planEnvRenames } from './lib/envvars.mjs';
import { lockfileCheck, lockfileError, verifyStep } from './lib/verify.mjs';
import { EXIT, EXIT_NAMES, ExitError } from './lib/names.mjs';
import { applyPackages, planPackages, runDocgen, runInstall, runLintFix } from './lib/packages.mjs';
import { scanOutbound } from './lib/outbound.mjs';
import { PLAN_PATH, readPlan, writeNotes, writePlan, writeVerify } from './lib/report.mjs';
import { createContext, git } from './lib/textfiles.mjs';
import { testDiff } from './lib/testdiff.mjs';
import { applyTokens, proposeTokens, readTokenMap, writeTokenMap } from './lib/tokens.mjs';
import { applyUrls, planUrls } from './lib/urls.mjs';
import { classifyWorkflows } from './lib/workflows.mjs';

const USAGE = `Usage:
  cli.mjs plan --root <dir>
  cli.mjs apply packages|env|tokens|urls|assets|docker --root <dir>
  cli.mjs lockfile-check --base <commit> --root <dir>
  cli.mjs test-diff --base <commit> --root <dir>
  cli.mjs verify packages|env|branding [--base <commit>] [--run-check] --root <dir>
  cli.mjs --help
`;

const STEPS = ['packages', 'env', 'tokens', 'urls', 'assets', 'docker'];
const VERIFY_STEPS = ['packages', 'env', 'branding'];
const DIRTY_ALLOWED_FILES = new Set(['AGENTS.md', 'docs/parity.md', 'docs/port-notes.md']);

/**
 * @typedef {{ command: string, sub: string | null, base: string | null, root: string, quiet: boolean, runCheck: boolean }} Args
 */

/**
 * @param {string[]} argv
 * @returns {Args | { help: true }}
 */
export function parseArgs(argv) {
  /** @type {string | null} */
  let command = null;
  /** @type {string | null} */
  let sub = null;
  /** @type {string | null} */
  let base = null;
  /** @type {string | null} */
  let root = null;
  let quiet = false;
  let runCheck = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') return { help: true };
    if (a === '--quiet') quiet = true;
    else if (a === '--run-check') runCheck = true;
    else if (a === '--root' || a === '--base') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) throw new ExitError(EXIT.USAGE, `${a} requires a value`);
      if (a === '--root') root = v;
      else base = v;
    } else if (a.startsWith('--')) throw new ExitError(EXIT.USAGE, `Unknown flag: ${a}`);
    else if (command === null) command = a;
    else if (sub === null) sub = a;
    else throw new ExitError(EXIT.USAGE, `Unexpected argument: ${a}`);
  }
  if (command === null) throw new ExitError(EXIT.USAGE, 'A command is required');
  if (!['plan', 'apply', 'lockfile-check', 'test-diff', 'verify'].includes(command)) {
    throw new ExitError(EXIT.USAGE, `Unknown command: ${command}`);
  }
  if (command === 'apply' && !(sub && STEPS.includes(sub))) {
    throw new ExitError(EXIT.USAGE, `apply needs one of: ${STEPS.join(', ')}`);
  }
  if (command === 'verify' && !(sub && VERIFY_STEPS.includes(sub))) {
    throw new ExitError(EXIT.USAGE, `verify needs one of: ${VERIFY_STEPS.join(', ')}`);
  }
  if ((command === 'lockfile-check' || command === 'test-diff') && !base) {
    throw new ExitError(EXIT.USAGE, `${command} requires --base <commit>`);
  }
  if ((command === 'plan' || command === 'lockfile-check' || command === 'test-diff') && sub !== null) {
    throw new ExitError(EXIT.USAGE, `Unexpected argument: ${sub}`);
  }
  if (root === null) throw new ExitError(EXIT.USAGE, '--root <dir> is required');
  return { command, sub, base, root, quiet, runCheck };
}

/** @param {string} root @returns {string[]} */
function dirtyTrackedFiles(root) {
  const entries = git(root, ['status', '--porcelain', '-z', '--untracked-files=no']).split('\0');
  /** @type {string[]} */
  const out = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.length < 4) continue;
    out.push(e.slice(3));
    if (e[0] === 'R' || e[0] === 'C' || e[1] === 'R' || e[1] === 'C') {
      i++;
      if (entries[i]) out.push(entries[i]);
    }
  }
  return out;
}

/** @param {string} root */
function requireCleanOutsidePort(root) {
  const bad = dirtyTrackedFiles(root).filter(p => !p.startsWith('port/') && !DIRTY_ALLOWED_FILES.has(p));
  if (bad.length > 0) {
    throw new ExitError(
      EXIT.STATE_MISMATCH,
      `${bad.length} modified tracked file(s) outside port/: ${bad.slice(0, 10).join(', ')}${bad.length > 10 ? ', ...' : ''}. Commit or finish the previous step.`,
    );
  }
}

/** @param {string} root */
function requireEnvCommit(root) {
  let subjects = '';
  try {
    subjects = git(root, ['log', '--format=%s', 'HEAD']);
  } catch {
    throw new ExitError(EXIT.STATE_MISMATCH, 'HEAD has no commit history');
  }
  if (!subjects.split('\n').includes('Rename env vars')) {
    throw new ExitError(EXIT.STATE_MISMATCH, 'No "Rename env vars" commit in HEAD history; finish commits 1 and 2 first');
  }
}

/**
 * Package renames from the tree, falling back to the recorded plan when already applied.
 * @param {import('./lib/textfiles.mjs').RCtx} ctx
 * @param {any} prev
 */
function effectivePackageRenames(ctx, prev) {
  const fresh = planPackages(ctx).renames;
  if (fresh.length > 0) return { renames: fresh, fresh: true, baseCommit: null };
  const old = prev?.packages?.renames ?? [];
  return { renames: old, fresh: false, baseCommit: prev?.packages?.baseCommit ?? null };
}

/**
 * @param {{ from: string, to: string }[]} a
 * @param {{ from: string, to: string }[]} b
 */
function mergeRenames(a, b) {
  /** @type {Map<string, { from: string, to: string }>} */
  const m = new Map();
  for (const r of a) m.set(r.from, r);
  for (const r of b) m.set(r.from, r);
  return [...m.values()].sort((x, y) => (x.from < y.from ? -1 : 1));
}

/** @param {{ log(m: string): void, err(m: string): void }} io */
function runPlan(ctx, io) {
  const prev = readPlan(ctx);
  const pk = effectivePackageRenames(ctx, prev);

  const found = discoverEnvVars(ctx);
  const envPlan = planEnvRenames(found.names, { prefix: ctx.names.ENV_PREFIX, existing: found.all });
  const envRenames = mergeRenames(prev?.env?.renames ?? [], envPlan.renames);

  const existingMap = readTokenMap(ctx);
  const map = proposeTokens(ctx, existingMap);
  writeTokenMap(ctx, map);
  ensureAllowlist(ctx);
  const allow = readAllowlist(ctx);

  /** @type {Record<string, number>} */
  const tokenCounts = {};
  for (const e of map.entries) tokenCounts[e.status] = (tokenCounts[e.status] ?? 0) + 1;

  const urls = planUrls(ctx);
  /** @type {Record<string, number>} */
  const urlCounts = {};
  for (const u of urls) {
    const k = `rule ${u.rule} ${u.action}`;
    urlCounts[k] = (urlCounts[k] ?? 0) + 1;
  }
  const outbound = scanOutbound(ctx);
  const assets = validateAssets(ctx);

  const plan = {
    schemaVersion: 1,
    constants: {
      PRODUCT_NAME: ctx.names.PRODUCT_NAME,
      PRODUCT_SLUG: ctx.names.PRODUCT_SLUG,
      NPM_SCOPE: ctx.names.NPM_SCOPE,
      ENV_PREFIX: ctx.names.ENV_PREFIX,
      SHORT_SLUG: ctx.names.SHORT_SLUG,
      DOCS_URL: ctx.names.DOCS_URL,
      IMAGE_REGISTRY: ctx.names.IMAGE_REGISTRY,
      IMAGE_NAMESPACE: ctx.names.IMAGE_NAMESPACE,
      ORIGIN_WEB_URL: ctx.names.ORIGIN_WEB_URL,
    },
    packages: {
      renames: pk.renames,
      baseCommit: pk.baseCommit,
    },
    env: {
      renames: envRenames,
      collisions: envPlan.collisions,
      embedded: found.embedded,
      pending: envPlan.renames.length,
    },
    tokens: {
      path: 'port/rebrand/token-map.json',
      counts: tokenCounts,
      open: map.entries.filter(e => e.status === 'proposed' || e.status === 'review').map(e => e.token),
    },
    allowlist: { path: 'port/rebrand/allowlist.json', entries: allow.entries.length },
    urls: {
      counts: urlCounts,
      review: urls.filter(u => u.action === 'review').map(u => ({ path: u.path, line: u.line, url: u.url, rule: u.rule })),
    },
    outbound: outbound.map(h => ({ path: h.path, line: h.line, url: h.url, host: h.host, context: h.context, feature: h.feature })),
    workflows: classifyWorkflows(ctx).map(w => ({ path: w.path, class: w.class, reasons: w.reasons })),
    assets: { ok: assets.ok, problems: assets.problems },
  };
  writePlan(ctx, plan);
  for (const c of envPlan.collisions) io.err(`W_ENV_COLLISION: ${c}`);
  for (const n of found.embedded) io.err(`W_ENV_EMBEDDED: ${n}`);
  io.log(
    `Plan written to ${PLAN_PATH}: ${pk.renames.length} package rename(s), ${envPlan.renames.length} pending env var rename(s), ${map.entries.length} token map entries, ${urls.length} URL hit(s), ${outbound.length} outbound hit(s).`,
  );
}

/**
 * @param {import('./lib/textfiles.mjs').RCtx} ctx
 * @param {string} step
 * @param {{ log(m: string): void, err(m: string): void }} io
 */
function runApply(ctx, step, io) {
  const root = ctx.root;
  if (step === 'packages' || step === 'env') requireCleanOutsidePort(root);
  else requireEnvCommit(root);

  const prev = readPlan(ctx);

  if (step === 'packages') {
    const pk = effectivePackageRenames(ctx, prev);
    const head = git(root, ['rev-parse', 'HEAD']).trim();
    const { changed } = applyPackages(ctx, pk.renames);
    ctx.refresh();
    io.log(`Packages: ${pk.renames.length} rename(s), ${changed.length} file(s) changed.`);
    if (pk.fresh || changed.length > 0) {
      const next = prev ?? { schemaVersion: 1 };
      next.packages = { renames: pk.renames, baseCommit: pk.fresh ? head : (pk.baseCommit ?? head) };
      writePlan(ctx, next);
      runInstall(root, io.log);
      const problems = lockfileCheck(ctx, 'HEAD', pk.renames);
      if (problems.length > 0) throw lockfileError(problems);
      io.log('Lockfile check passed.');
      const api = pk.renames.find(r => r.dir === 'packages/api')?.to ?? ctx.names.NPM_SCOPE + '/api';
      runDocgen(root, api, io.log);
      runLintFix(root, io.log);
      ctx.refresh();
    }
    return;
  }

  if (step === 'env') {
    const found = discoverEnvVars(ctx);
    const plan = planEnvRenames(found.names, { prefix: ctx.names.ENV_PREFIX, existing: found.all });
    for (const c of plan.collisions) io.err(`W_ENV_COLLISION: ${c}`);
    for (const n of found.embedded) io.err(`W_ENV_EMBEDDED: ${n} (not renamed)`);
    const changed = applyEnvRenames(ctx, plan.renames);
    io.log(`Env vars: ${plan.renames.length} rename(s), ${changed.length} file(s) changed.`);
    if (changed.length > 0) {
      runLintFix(root, io.log);
      ctx.refresh();
    }
    if (plan.renames.length > 0) {
      const next = prev ?? { schemaVersion: 1 };
      const merged = mergeRenames(next.env?.renames ?? [], plan.renames);
      next.env = { renames: merged, collisions: plan.collisions, embedded: found.embedded, pending: 0 };
      writePlan(ctx, next);
    }
    return;
  }

  if (step === 'tokens') {
    const map = readTokenMap(ctx);
    if (!map) throw new ExitError(EXIT.TOKEN_MAP_INVALID, 'port/rebrand/token-map.json does not exist; run port/rebrand.sh plan');
    const r = applyTokens(ctx, map);
    io.log(`Tokens: ${r.changed.length} file(s) changed, ${r.allowlistAdded} allowlist entr${r.allowlistAdded === 1 ? 'y' : 'ies'} added.`);
    return;
  }

  if (step === 'urls') {
    const hits = planUrls(ctx);
    const changed = applyUrls(ctx, hits);
    const review = hits.filter(h => h.action === 'review').length;
    io.log(`URLs: ${changed.length} file(s) changed, ${review} URL(s) need review.`);
    return;
  }

  if (step === 'assets') {
    const r = installAssets(ctx);
    io.log(`Assets: ${r.changed.length} path(s) changed.`);
    return;
  }

  if (step === 'docker') {
    const changed = applyDocker(ctx);
    io.log(`Docker: ${changed.length} file(s) changed.`);
  }
}

/**
 * @param {import('./lib/textfiles.mjs').RCtx} ctx
 * @returns {import('./lib/report.mjs').NotesData}
 */
function notesData(ctx) {
  const plan = readPlan(ctx);
  const map = readTokenMap(ctx);
  /** @type {Record<string, number>} */
  const tokens = {};
  for (const e of map?.entries ?? []) tokens[e.status] = (tokens[e.status] ?? 0) + 1;
  /** @type {Record<string, number>} */
  const allowlist = {};
  for (const e of readAllowlist(ctx).entries) allowlist[e.reason] = (allowlist[e.reason] ?? 0) + 1;
  /** @type {Record<string, number>} */
  const urls = {};
  for (const u of planUrls(ctx)) {
    const k = `rule ${u.rule} ${u.action}`;
    urls[k] = (urls[k] ?? 0) + 1;
  }
  /** @type {Record<string, number>} */
  const outbound = {};
  for (const h of scanOutbound(ctx)) outbound[h.context] = (outbound[h.context] ?? 0) + 1;
  /** @type {Record<string, number>} */
  const workflows = {};
  for (const w of classifyWorkflows(ctx)) workflows[w.class] = (workflows[w.class] ?? 0) + 1;
  /** @type {{ id: string, note: string }[]} */
  const needsDecision = [];
  if (ctx.exists('port/features.json')) {
    for (const f of JSON.parse(ctx.read('port/features.json')).features ?? []) {
      if (f.status === 'needs_decision') needsDecision.push({ id: f.id, note: f.decision?.note ?? '' });
    }
  }
  return {
    packages: plan?.packages?.renames ?? [],
    // Renames still pending are not part of the notes until the step has run.
    env: (plan?.env?.pending ?? 0) === 0 ? (plan?.env?.renames ?? []) : [],
    envCollisions: (plan?.env?.pending ?? 0) === 0 ? (plan?.env?.collisions ?? []) : [],
    tokens,
    allowlist,
    urls,
    outbound,
    workflows,
    needsDecision,
  };
}

/**
 * Run the CLI. Returns the exit code.
 * @param {string[]} argv
 * @param {{ log(msg: string): void, err(msg: string): void }} [io]
 * @returns {Promise<number>}
 */
export async function run(argv, io) {
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
      if (git(root, ['rev-parse', '--is-inside-work-tree']).trim() !== 'true') throw new Error('not a work tree');
    } catch {
      throw new ExitError(EXIT.CONFIG, `--root is not a git work tree: ${args.root}`);
    }
    const ctx = createContext(root);

    if (args.command === 'plan') {
      runPlan(ctx, out);
      return 0;
    }
    if (args.command === 'apply') {
      runApply(ctx, /** @type {string} */ (args.sub), out);
      return 0;
    }
    if (args.command === 'lockfile-check') {
      const plan = readPlan(ctx);
      const renames = plan?.packages?.renames ?? [];
      const problems = lockfileCheck(ctx, /** @type {string} */ (args.base), renames);
      if (problems.length > 0) throw lockfileError(problems);
      out.log(`Lockfile matches ${args.base} apart from workspace entries.`);
      return 0;
    }
    if (args.command === 'test-diff') {
      const r = testDiff(ctx, /** @type {string} */ (args.base));
      if (!r.ok) {
        throw new ExitError(EXIT.TEST_DIFF, `${r.problems.length} test change(s) beyond substitution:\n  ${r.problems.slice(0, 50).join('\n  ')}`);
      }
      out.log('Test files differ from the base only by substitution.');
      return 0;
    }
    // verify
    const step = /** @type {'packages' | 'env' | 'branding'} */ (args.sub);
    const result = await verifyStep(ctx, step, { base: args.base ?? undefined, runCheck: args.runCheck });
    writeVerify(ctx, { schemaVersion: 1, step: result.step, status: result.status, checks: result.checks, warnings: result.warnings });
    writeNotes(ctx, notesData(ctx));
    for (const w of result.warnings.slice(0, 50)) out.err(`warning ${w}`);
    for (const c of result.checks) out.log(`${c.status === 'pass' ? 'PASS' : 'FAIL'} ${c.name}`);
    if (result.status !== 'pass') {
      const problems = result.checks.filter(c => c.status === 'fail').flatMap(c => c.problems.map(p => `${c.name}: ${p}`));
      throw new ExitError(EXIT.VERIFY_FAILED, `verify ${step} failed with ${problems.length} problem(s):\n  ${problems.slice(0, 50).join('\n  ')}`);
    }
    out.log(`verify ${step}: pass`);
    return 0;
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
  run(process.argv.slice(2)).then(code => {
    process.exitCode = code;
  });
}
