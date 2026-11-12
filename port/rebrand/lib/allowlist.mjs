// Allowlist of remaining brand hits.
import { cmp, EXIT, ExitError } from './names.mjs';

export const ALLOWLIST_PATH = 'port/rebrand/allowlist.json';

export const ALLOWLIST_REASONS = [
  'engine_reference',
  'external_dependency',
  'internal_identifier',
  'upstream_attribution',
  'pending_decision',
  'clickhouse_build_gated',
  'not_a_request',
  'test_fixture',
];

/** @typedef {{ path: string, term: string, snippet: string, reason: string, note: string }} AllowEntry */
/** @typedef {{ schemaVersion: 1, entries: AllowEntry[] }} Allowlist */

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @returns {Allowlist}
 */
export function readAllowlist(ctx) {
  if (!ctx.exists(ALLOWLIST_PATH)) return { schemaVersion: 1, entries: [] };
  try {
    const a = JSON.parse(ctx.read(ALLOWLIST_PATH));
    if (a.schemaVersion !== 1 || !Array.isArray(a.entries)) throw new Error('bad shape');
    return a;
  } catch {
    throw new ExitError(EXIT.VERIFY_FAILED, `${ALLOWLIST_PATH} is not a valid allowlist`);
  }
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {Allowlist} a
 */
export function writeAllowlist(ctx, a) {
  const entries = [...a.entries].sort((x, y) => cmp(x.path, y.path) || cmp(x.term, y.term) || cmp(x.snippet, y.snippet));
  return ctx.write(ALLOWLIST_PATH, JSON.stringify({ schemaVersion: 1, entries }, null, 2) + '\n');
}

/**
 * Index of the first entry matching an occurrence, or -1: same path and term, and the trimmed
 * line contains the snippet.
 * @param {AllowEntry[]} entries
 * @param {string} path
 * @param {string} term
 * @param {string} line
 */
export function findAllowEntry(entries, path, term, line) {
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.path === path && e.term === term && line.includes(e.snippet)) return i;
  }
  return -1;
}

/**
 * Create the file when absent. Existing entries are never changed.
 * @param {import('./textfiles.mjs').RCtx} ctx
 */
export function ensureAllowlist(ctx) {
  if (!ctx.exists(ALLOWLIST_PATH)) writeAllowlist(ctx, { schemaVersion: 1, entries: [] });
}
