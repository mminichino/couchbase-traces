// plan.json, verify.json, and the Phase 3 notes block.
import { cmp } from './names.mjs';

export const PLAN_PATH = 'port/state/rebrand/plan.json';
export const VERIFY_PATH = 'port/state/rebrand/verify.json';
export const PHASE3_START = '<!-- phase3:start -->';
export const PHASE3_END = '<!-- phase3:end -->';
const PHASE2_END = '<!-- phase2:end -->';

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @returns {any | null}
 */
export function readPlan(ctx) {
  if (!ctx.exists(PLAN_PATH)) return null;
  try {
    return JSON.parse(ctx.read(PLAN_PATH));
  } catch {
    return null;
  }
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {any} plan
 */
export function writePlan(ctx, plan) {
  return ctx.write(PLAN_PATH, JSON.stringify(plan, null, 2) + '\n');
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {any} verify
 */
export function writeVerify(ctx, verify) {
  return ctx.write(VERIFY_PATH, JSON.stringify(verify, null, 2) + '\n');
}

/**
 * @param {Record<string, number>} counts
 */
function countRows(counts) {
  const keys = Object.keys(counts).sort(cmp);
  if (keys.length === 0) return ['None.'];
  return ['| Key | Count |', '|---|---|', ...keys.map(k => `| ${k} | ${counts[k]} |`)];
}

/**
 * @typedef {{ packages: { from: string, to: string, dir: string }[], env: { from: string, to: string }[],
 *   envCollisions: string[], tokens: Record<string, number>, allowlist: Record<string, number>,
 *   urls: Record<string, number>, outbound: Record<string, number>, workflows: Record<string, number>,
 *   needsDecision: { id: string, note: string }[] }} NotesData
 */

/**
 * @param {NotesData} d
 * @returns {string}
 */
export function renderNotesBlock(d) {
  const L = [PHASE3_START, '## Phase 3: Rebrand', ''];
  L.push('### Package renames', '');
  if (d.packages.length === 0) L.push('None.');
  else {
    L.push('| From | To | Directory |', '|---|---|---|');
    for (const r of d.packages) L.push(`| \`${r.from}\` | \`${r.to}\` | \`${r.dir}\` |`);
  }
  L.push('', '### Environment variable map', '');
  if (d.env.length === 0) L.push('None.');
  else {
    L.push('| From | To |', '|---|---|');
    for (const r of d.env) L.push(`| \`${r.from}\` | \`${r.to}\` |`);
  }
  if (d.envCollisions.length > 0) {
    L.push('', 'W_ENV_COLLISION:', '');
    for (const c of d.envCollisions) L.push(`- ${c}`);
  }
  L.push('', '### Token map by status', '', ...countRows(d.tokens));
  L.push('', '### Allowlist by reason', '', ...countRows(d.allowlist));
  L.push('', '### URL actions by rule', '', ...countRows(d.urls));
  L.push('', '### Outbound hits by context', '', ...countRows(d.outbound));
  L.push('', '### Workflow classes', '', ...countRows(d.workflows));
  L.push('', '### Features pending a decision', '');
  if (d.needsDecision.length === 0) L.push('None.');
  else for (const f of d.needsDecision) L.push(`- \`${f.id}\`: ${f.note}`);
  L.push(PHASE3_END);
  return L.join('\n');
}

/**
 * Replace the Phase 3 block, or insert it after the Phase 2 block (or at the end).
 * Text outside the markers is preserved.
 * @param {string} existing
 * @param {string} block
 */
export function replacePhase3Block(existing, block) {
  const s = existing.indexOf(PHASE3_START);
  const e = existing.indexOf(PHASE3_END);
  if (s >= 0 && e > s) return existing.slice(0, s) + block + existing.slice(e + PHASE3_END.length);
  const p2 = existing.indexOf(PHASE2_END);
  if (p2 >= 0) {
    const at = p2 + PHASE2_END.length;
    return existing.slice(0, at) + '\n\n' + block + existing.slice(at);
  }
  return existing.replace(/\n*$/, '\n\n') + block + '\n';
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {NotesData} data
 */
export function writeNotes(ctx, data) {
  const path = 'docs/port-notes.md';
  const existing = ctx.exists(path) ? ctx.read(path) : '# Port notes\n';
  const next = replacePhase3Block(existing, renderNotesBlock(data));
  return ctx.write(path, next.endsWith('\n') ? next : next + '\n');
}
