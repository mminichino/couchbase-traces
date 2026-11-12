// Per-step verification.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { findAllowEntry, readAllowlist } from './allowlist.mjs';
import { validateAssets } from './assets.mjs';
import { discoverEnvVars } from './envvars.mjs';
import { lockfileDrift } from './lockfile.mjs';
import { EXIT, ExitError } from './names.mjs';
import { renameRegex } from './packages.mjs';
import { scanOutbound } from './outbound.mjs';
import { PLAN_PATH, readPlan } from './report.mjs';
import { git, isSourceFile, kindAt, lineAt, lineIndex, sourceRanges } from './textfiles.mjs';
import { testDiff } from './testdiff.mjs';
import { loadInventoryData } from './tokens.mjs';
import { planUrls } from './urls.mjs';
import { classifyWorkflows, isWorkflowFile, secretReferences } from './workflows.mjs';

/** @typedef {{ name: string, status: 'pass' | 'fail', problems: string[] }} Check */

/** @param {string} name @param {string[]} problems @returns {Check} */
function check(name, problems) {
  return { name, status: problems.length === 0 ? 'pass' : 'fail', problems };
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {string} base
 * @param {{ from: string, to: string, dir: string }[]} renames
 * @returns {string[]} problems
 */
export function lockfileCheck(ctx, base, renames) {
  let baseText;
  try {
    baseText = git(ctx.root, ['show', `${base}:yarn.lock`]);
  } catch {
    return [`yarn.lock does not exist at ${base}`];
  }
  if (!ctx.exists('yarn.lock')) return ['yarn.lock is missing from the working tree'];
  return lockfileDrift(baseText, ctx.read('yarn.lock'), renames);
}

/**
 * @param {string[]} problems
 * @param {string} code
 */
export function lockfileError(problems, code = 'E_LOCKFILE_DRIFT') {
  const shown = problems.slice(0, 50).join('\n  ');
  return new ExitError(EXIT.LOCKFILE_DRIFT, `${problems.length} lockfile problem(s) (${code}):\n  ${shown}${problems.length > 50 ? '\n  ...' : ''}`);
}

// ---------------------------------------------------------------------------
// Brand term rule

const BRAND_TERM_SRC = 'hyperdx|clickstack|deploysentinel|(?<![A-Za-z0-9_-])hdx(?![A-Za-z0-9_-])|ClickHouse Cloud|ClickHouse, Inc\\.|ClickHouse Inc\\b';
const QUICK = /hyperdx|clickstack|deploysentinel|\bhdx\b|ClickHouse Cloud|ClickHouse, Inc|ClickHouse Inc/i;
const SCOPED_RE = /@[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/g;
const RUN_RE = /[A-Za-z0-9_.-]+/g;

/**
 * @typedef {{ path: string, line: number, term: string, snippet: string, context: string }} Violation
 */

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @returns {{ violations: Violation[], warnings: { code: string, message: string }[], used: Set<number>, total: number }}
 */
export function checkBrandTerms(ctx) {
  const data = loadInventoryData(ctx);
  const allow = readAllowlist(ctx);
  /** @type {Violation[]} */
  const violations = [];
  /** @type {Set<number>} */
  const used = new Set();
  let total = 0;

  for (const p of ctx.rewritable()) {
    const text = ctx.read(p);
    if (!QUICK.test(text)) continue;
    const ranges = isSourceFile(p) ? sourceRanges(ctx, p, text) : null;
    const lineOf = lineIndex(text);
    /** @type {{ start: number, end: number }[]} */
    const scoped = [];
    SCOPED_RE.lastIndex = 0;
    let sm;
    while ((sm = SCOPED_RE.exec(text))) {
      if (/^@(hyperdx|clickhouse)\//i.test(sm[0])) scoped.push({ start: sm.index, end: sm.index + sm[0].length });
    }
    const re = new RegExp(BRAND_TERM_SRC, 'gi');
    let m;
    while ((m = re.exec(text))) {
      const start = m.index;
      const end = start + m[0].length;
      const kind = kindAt(ranges, start);
      if (kind === 'identifier' || kind === 'comment') continue;
      if (scoped.some(s => start >= s.start && end <= s.end)) continue;
      if (kind === 'import_specifier') {
        const spec = text.slice(Math.max(0, start - 200), start);
        const q = Math.max(spec.lastIndexOf("'"), spec.lastIndexOf('"'), spec.lastIndexOf('`'));
        const after = spec.slice(q + 1);
        if (!after.startsWith('.') && !after.startsWith('/')) continue;
      }
      // Token: surrounding run.
      let s = start;
      let e = end;
      while (s > 0 && /[A-Za-z0-9_.-]/.test(text[s - 1])) s--;
      while (e < text.length && /[A-Za-z0-9_.-]/.test(text[e])) e++;
      const token = text.slice(s, e).replace(/^[.-]+/, '').replace(/[.-]+$/, '');
      if (data.schemaIds.has(token)) continue;
      if (/^hdx[-_]/i.test(token) || /^__hdx_/.test(token)) continue;
      total++;
      const term = m[0].toLowerCase();
      const line = lineAt(text, start);
      const idx = findAllowEntry(allow.entries, p, term, line);
      if (idx >= 0) {
        used.add(idx);
        continue;
      }
      violations.push({ path: p, line: lineOf(start), term, snippet: line.slice(0, 160), context: kind });
    }
  }

  /** @type {{ code: string, message: string }[]} */
  const warnings = [];
  allow.entries.forEach((e, i) => {
    if (!used.has(i) && e.reason !== 'not_a_request') {
      warnings.push({ code: 'W_ALLOWLIST_UNUSED', message: `${e.path} [${e.term}] ${JSON.stringify(e.snippet)}` });
    }
  });
  return { violations, warnings, used, total };
}

// ---------------------------------------------------------------------------
// Brand module

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @returns {string[]}
 */
export function checkBrandModule(ctx) {
  /** @type {string[]} */
  const problems = [];
  const dir = 'packages/app/src/brand';
  const files = { index: `${dir}/index.tsx`, logomark: `${dir}/Logomark.tsx`, wordmark: `${dir}/Wordmark.tsx` };
  for (const f of Object.values(files)) if (!ctx.exists(f)) problems.push(`${f}: missing`);
  if (problems.length > 0) return problems;
  const idx = ctx.read(files.index);
  for (const n of ['BRAND_DISPLAY_NAME', 'useBrandDisplayName', 'usePageTitle', 'useWordmark', 'useLogomark']) {
    if (!new RegExp(`export\\s+(?:const|function)\\s+${n}\\b`).test(idx)) problems.push(`${files.index}: export ${n} is missing`);
  }
  if (!/export\s+const\s+BRAND_DISPLAY_NAME\s*(?::\s*string\s*)?=\s*['"`]/.test(idx)) {
    problems.push(`${files.index}: BRAND_DISPLAY_NAME must be a string constant`);
  }
  if (!/function\s+usePageTitle\s*\(\s*page\?\s*:\s*string\s*\)\s*(?::\s*string)?/.test(idx)) {
    problems.push(`${files.index}: usePageTitle must keep the signature (page?: string)`);
  }
  if (!/function\s+useLogomark\s*\(\s*props\?\s*:\s*\{\s*size\?\s*:\s*number\s*;?\s*\}\s*\)/.test(idx)) {
    problems.push(`${files.index}: useLogomark must keep the signature (props?: { size?: number })`);
  }
  if (!/function\s+useWordmark\s*\(\s*\)/.test(idx)) problems.push(`${files.index}: useWordmark must take no arguments`);
  const lm = ctx.read(files.logomark);
  if (!/export\s+default\s+function\s+Logomark\b/.test(lm)) problems.push(`${files.logomark}: default export Logomark is missing`);
  if (!/\bsize\b/.test(lm) || !/\bfit\b/.test(lm) || !/'square'/.test(lm) || !/'symbol'/.test(lm)) {
    problems.push(`${files.logomark}: props must keep size and fit: 'square' | 'symbol'`);
  }
  const wm = ctx.read(files.wordmark);
  if (!/export\s+default\s+function\s+Wordmark\b/.test(wm)) problems.push(`${files.wordmark}: default export Wordmark is missing`);
  if (!/\bname\b\s*[:}]/.test(wm)) problems.push(`${files.wordmark}: props must keep name`);
  return problems;
}

// ---------------------------------------------------------------------------
// Features

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @returns {Promise<string[]>}
 */
export async function checkFeatures(ctx) {
  const path = join(ctx.root, 'port/features.json');
  if (!existsSync(path)) return ['port/features.json does not exist'];
  try {
    const [{ createContext }, { scanWorkspaces }, { scanImports }, { scanEntryPoints }, { validateFeatures }] = await Promise.all([
      import('../../inventory/lib/context.mjs'),
      import('../../inventory/lib/workspaces.mjs'),
      import('../../inventory/lib/imports.mjs'),
      import('../../inventory/lib/entrypoints.mjs'),
      import('../../inventory/lib/features.mjs'),
    ]);
    const ictx = createContext(ctx.root);
    const ws = scanWorkspaces(ictx);
    const imports = scanImports(ictx, ws);
    const entry = scanEntryPoints(ictx, imports);
    return validateFeatures(JSON.parse(readFileSync(path, 'utf8')), entry.entryPoints);
  } catch (err) {
    return [`inventory scan failed: ${err instanceof Error ? err.message : String(err)}`];
  }
}

// ---------------------------------------------------------------------------
// Verify steps

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {{ base?: string }} opts
 * @returns {Check[]}
 */
function verifyPackages(ctx, opts) {
  const plan = readPlan(ctx);
  /** @type {{ from: string, to: string, dir: string }[]} */
  const renames = plan?.packages?.renames ?? [];
  /** @type {Check[]} */
  const checks = [];

  /** @type {string[]} */
  const stale = [];
  if (renames.length > 0) {
    const re = renameRegex(renames);
    for (const p of ctx.rewritable()) {
      const text = ctx.read(p);
      re.lastIndex = 0;
      const m = re.exec(text);
      if (m) stale.push(`${p}: ${m[1]}`);
    }
  }
  if (!plan) stale.push(`${PLAN_PATH} is missing; run port/rebrand.sh plan`);
  checks.push(check('no old workspace names', stale.slice(0, 50)));

  const base = opts.base ?? plan?.packages?.baseCommit ?? 'HEAD';
  checks.push(check(`lockfile-check --base ${base}`, renames.length > 0 ? lockfileCheck(ctx, base, renames).slice(0, 50) : []));

  /** @type {string[]} */
  const go = [];
  for (const f of ctx.files) {
    if (f !== 'go.mod' && !f.endsWith('/go.mod')) continue;
    if (/ClickHouse\/ClickStack|hyperdxio\/hyperdx/.test(ctx.read(f))) go.push(`${f}: still has an upstream module path`);
  }
  checks.push(check('go.mod module path', go));
  return checks;
}

/** @param {import('./textfiles.mjs').RCtx} ctx @returns {Check[]} */
function verifyEnv(ctx) {
  const found = discoverEnvVars(ctx);
  const problems = found.contexts.slice(0, 50).map(c => `${c.path}:${c.line}: ${c.name} (${c.context})`);
  return [check('no HYPERDX or HDX env vars', found.names.length > 0 ? [...new Set(problems)] : [])];
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {{ base?: string }} opts
 * @returns {Promise<{ checks: Check[], warnings: string[] }>}
 */
async function verifyBranding(ctx, opts) {
  /** @type {Check[]} */
  const checks = [];
  /** @type {string[]} */
  const warnings = [];

  const assets = validateAssets(ctx);
  const assetProblems = [...assets.problems];
  if (existsSync(join(ctx.root, 'packages/app/public/favicons/clickstack'))) {
    assetProblems.push('packages/app/public/favicons/clickstack/ still exists');
  }
  checks.push(check('brand assets', assetProblems));
  checks.push(check('brand module exports', checkBrandModule(ctx)));

  const terms = checkBrandTerms(ctx);
  checks.push(
    check(
      'brand terms',
      terms.violations.slice(0, 100).map(v => `${v.path}:${v.line}: ${v.term} (${v.context}): ${v.snippet}`),
    ),
  );

  // Outbound.
  const allow = readAllowlist(ctx);
  const features = ctx.exists('port/features.json') ? JSON.parse(ctx.read('port/features.json')).features : [];
  const pending = new Set(features.filter((/** @type {any} */ f) => f.status === 'needs_decision').map((/** @type {any} */ f) => f.id));
  /** @type {string[]} */
  const outProblems = [];
  const usedOut = new Set();
  for (const h of scanOutbound(ctx)) {
    if (h.context === 'link') continue;
    if (h.feature && pending.has(h.feature)) continue;
    const idx = allow.entries.findIndex(e => e.reason === 'not_a_request' && e.path === h.path && (h.url.includes(e.snippet) || e.snippet.includes(h.host)));
    if (idx >= 0) {
      usedOut.add(idx);
      continue;
    }
    outProblems.push(`${h.path}:${h.line}: ${h.context} to ${h.host} (${h.url})`);
  }
  checks.push(check('outbound requests', outProblems));
  allow.entries.forEach((e, i) => {
    if (e.reason === 'not_a_request' && !usedOut.has(i)) {
      terms.warnings.push({ code: 'W_ALLOWLIST_UNUSED', message: `${e.path} [${e.term}] ${JSON.stringify(e.snippet)}` });
    }
  });
  checks.push(check('allowlist entries all used', terms.warnings.filter(w => w.code === 'W_ALLOWLIST_UNUSED').map(w => `W_ALLOWLIST_UNUSED: ${w.message}`)));

  // URLs.
  checks.push(
    check(
      'urls',
      planUrls(ctx)
        .filter(h => h.action === 'review')
        .slice(0, 100)
        .map(h => `${h.path}:${h.line}: rule ${h.rule}: ${h.url}`),
    ),
  );

  // Workflows.
  /** @type {string[]} */
  const wf = [];
  for (const w of classifyWorkflows(ctx)) if (w.class !== 'ci') wf.push(`${w.path}: ${w.class} workflow remains (${w.reasons.join(', ')})`);
  for (const p of ctx.files) {
    if (!isWorkflowFile(p)) continue;
    for (const r of secretReferences(ctx.read(p))) wf.push(`${p}:${r.line}: references secret ${r.secret}`);
  }
  checks.push(check('workflows', wf));

  // Test diff against the commit before the step.
  const base = opts.base ?? 'HEAD';
  const td = testDiff(ctx, base);
  checks.push(check(`test-diff --base ${base}`, td.problems.slice(0, 100)));

  checks.push(check('features.json against a fresh scan', (await checkFeatures(ctx)).slice(0, 50)));

  // Lines where the product name now appears twice.
  const name = ctx.names.PRODUCT_NAME;
  for (const p of ctx.rewritable()) {
    if (!/\.(md|mdx|tsx|ts|jsx|js|json|yml|yaml)$/.test(p)) continue;
    const text = ctx.read(p);
    if (!text.includes(name)) continue;
    text.split('\n').forEach((l, i) => {
      const n = l.split(name).length - 1;
      if (n >= 2) warnings.push(`W_NAME_TWICE ${p}:${i + 1}: ${l.trim().slice(0, 120)}`);
    });
  }
  for (const w of terms.warnings) warnings.push(`${w.code}: ${w.message}`);
  return { checks, warnings };
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {'packages' | 'env' | 'branding'} step
 * @param {{ base?: string, runCheck?: boolean }} [opts]
 * @returns {Promise<{ schemaVersion: 1, step: string, status: 'pass' | 'fail', checks: Check[], warnings: string[] }>}
 */
export async function verifyStep(ctx, step, opts = {}) {
  /** @type {Check[]} */
  let checks;
  /** @type {string[]} */
  let warnings = [];
  if (step === 'packages') checks = verifyPackages(ctx, opts);
  else if (step === 'env') {
    checks = verifyEnv(ctx);
    warnings = discoverEnvVars(ctx).embedded.map(n => `W_ENV_EMBEDDED: ${n}`);
  } else {
    const r = await verifyBranding(ctx, opts);
    checks = r.checks;
    warnings = r.warnings;
  }
  if (opts.runCheck) {
    const res = spawnSync(join(ctx.root, 'port/check.sh'), ['--quiet'], { cwd: ctx.root, encoding: 'utf8' });
    checks.push(check('port/check.sh', res.status === 0 ? [] : [`port/check.sh exited ${res.status}`]));
  }
  const status = checks.every(c => c.status === 'pass') ? 'pass' : 'fail';
  return { schemaVersion: 1, step, status, checks, warnings };
}
