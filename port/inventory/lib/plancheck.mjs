// Plan path and symbol verification.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseOf, cmp } from './context.mjs';
import { SEED_PATHS } from './datalayer.mjs';
import { allRuleNames } from './sqlrules.mjs';

/**
 * @typedef {{ token: string, document: string, line: number, suggestion: string | null }} Missing
 * @typedef {{ missingPaths: Missing[], missingSymbols: Missing[] }} PlanCheck
 */

export const PLAN_DOCUMENT = 'COUCHBASE_PORT_PLAN.md';
const SEED_DOCUMENT = 'port/inventory/lib/datalayer.mjs';

/**
 * Levenshtein distance, giving up above `max`.
 * @param {string} a @param {string} b @param {number} max
 */
function distance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/**
 * @param {import('./context.mjs').Ctx} ctx
 * @param {any} importsResult
 * @returns {PlanCheck}
 */
export function checkPlan(ctx, importsResult) {
  /** @type {PlanCheck} */
  const out = { missingPaths: [], missingSymbols: [] };

  // Seed paths that no longer exist are plan problems too.
  for (const s of SEED_PATHS) {
    const exists = s.endsWith('/') ? ctx.files.some(f => f.startsWith(s)) : ctx.fileSet.has(s);
    if (!exists) {
      out.missingPaths.push({
        token: s,
        document: SEED_DOCUMENT,
        line: SEED_PATHS.indexOf(s) + 1,
        suggestion: suggestPath(ctx, s),
      });
    }
  }

  const planPath = join(ctx.root, PLAN_DOCUMENT);
  if (!existsSync(planPath)) {
    ctx.warn('W_PLAN_MISSING', `${PLAN_DOCUMENT} not found at the project root; plan check skipped`, PLAN_DOCUMENT);
    return out;
  }
  const plan = readFileSync(planPath, 'utf8');

  // Constants named in AGENTS.md
  /** @type {Set<string>} */
  const constants = new Set();
  if (ctx.fileSet.has('AGENTS.md')) {
    for (const m of ctx.read('AGENTS.md').matchAll(/^\|\s*`([A-Z][A-Z0-9_]*)`\s*\|/gm)) constants.add(m[1]);
  }
  const ruleNames = allRuleNames();

  /** @type {Set<string>} */
  const exported = new Set();
  for (const mod of importsResult.modules) {
    for (const e of mod.exports) if (e.name !== 'default') exported.add(e.name);
  }
  const exportedList = [...exported];

  /** @type {Set<string>} */
  const seen = new Set();
  let inFence = false;
  plan.split(/\r?\n/).forEach((lineText, i) => {
    if (/^\s*(```|~~~)/.test(lineText)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    for (const m of lineText.matchAll(/`([^`]+)`/g)) {
      const token = m[1].trim();
      if (!token || seen.has(token)) continue;

      if (looksLikePath(token)) {
        seen.add(token);
        const isDir = token.endsWith('/');
        const found = isDir ? ctx.files.some(f => f.startsWith(token)) : ctx.fileSet.has(token);
        if (!found) {
          out.missingPaths.push({ token, document: PLAN_DOCUMENT, line: i + 1, suggestion: suggestPath(ctx, token) });
        }
      } else if (/^[A-Z][A-Za-z0-9]+$/.test(token) || /^[a-z]+[A-Z][A-Za-z0-9]*$/.test(token)) {
        seen.add(token);
        if (constants.has(token) || ruleNames.has(token)) continue;
        if (exported.has(token)) continue;
        let best = 4;
        /** @type {string[]} */
        let candidates = [];
        for (const name of exportedList) {
          const d = distance(token, name, 3);
          if (d > 3) continue;
          if (d < best) {
            best = d;
            candidates = [name];
          } else if (d === best) candidates.push(name);
        }
        out.missingSymbols.push({
          token,
          document: PLAN_DOCUMENT,
          line: i + 1,
          suggestion: candidates.length === 1 ? candidates[0] : null,
        });
      }
    }
  });

  const order = (/** @type {Missing} */ a, /** @type {Missing} */ b) => a.line - b.line || cmp(a.token, b.token);
  out.missingPaths.sort(order);
  out.missingSymbols.sort(order);
  return out;
}

/** @param {string} token */
function looksLikePath(token) {
  if (!token.includes('/')) return false;
  if (/[\s<*${]/.test(token) || token.startsWith('http')) return false;
  if (token.startsWith('/')) return false;
  for (const p of ['port/', 'docs/', 'branding/']) if (token.startsWith(p)) return false;
  if (token.endsWith('/')) return true;
  const last = token.slice(token.lastIndexOf('/') + 1);
  return /\.[A-Za-z0-9]+$/.test(last);
}

/**
 * The tracked path (or directory) with the same basename, when exactly one exists.
 * @param {import('./context.mjs').Ctx} ctx
 * @param {string} token
 * @returns {string | null}
 */
function suggestPath(ctx, token) {
  const isDir = token.endsWith('/');
  const name = baseOf(isDir ? token.slice(0, -1) : token);
  if (!name) return null;
  /** @type {Set<string>} */
  const candidates = new Set();
  for (const f of ctx.files) {
    if (isDir) {
      const segs = f.split('/');
      for (let i = 0; i < segs.length - 1; i++) {
        if (segs[i] === name) candidates.add(segs.slice(0, i + 1).join('/') + '/');
      }
    } else if (baseOf(f) === name) candidates.add(f);
  }
  return candidates.size === 1 ? [...candidates][0] : null;
}
