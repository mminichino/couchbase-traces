// Token map proposal and application.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { ENV_NAME_RE } from './envvars.mjs';
import { cmp, EXIT, ExitError } from './names.mjs';
import { isSourceFile, lineAt, sourceRanges } from './textfiles.mjs';
import { ALLOWLIST_REASONS, readAllowlist, writeAllowlist } from './allowlist.mjs';
import { isEnvFile } from './docker.mjs';

export const TOKEN_MAP_PATH = 'port/rebrand/token-map.json';

/** Terms that make a token a candidate. `hdx` counts only as a standalone word. */
export const TERM_RE_SRC = 'hyperdx|clickstack|deploysentinel|(?<![A-Za-z0-9_-])hdx(?![A-Za-z0-9_-])';
export const PHRASE_RE_SRC = 'ClickHouse Cloud|ClickHouse, Inc\\.|ClickHouse Inc\\b';
const RUN_RE = /[A-Za-z0-9_.@-]+/g;
const URL_SPAN_RE = /https?:\/\/[^\s"'`<>\\)\]{}]+/g;
const SCOPED_RE = /@[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+/g;
const TLDS = new Set(['com', 'io', 'dev', 'net', 'org', 'ai', 'cloud', 'app', 'info', 'xyz', 'tech', 'co', 'us', 'uk', 'eu']);

/** @typedef {{ token: string, replacement: string | null, status: 'proposed' | 'review' | 'approved' | 'allowed',
 *   reason: string | null, occurrences: number, files: string[] }} TokenEntry */
/** @typedef {{ schemaVersion: 1, entries: TokenEntry[] }} TokenMap */

/** @param {string} t */
export function isEmailToken(t) {
  return /^[^@\s]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(t);
}

/** @param {string} t */
export function isHostToken(t) {
  if (!/^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(t)) return false;
  return TLDS.has(t.slice(t.lastIndexOf('.') + 1).toLowerCase());
}

/**
 * Spans of URLs in a text.
 * @param {string} text
 * @returns {{ start: number, end: number }[]}
 */
export function urlSpans(text) {
  /** @type {{ start: number, end: number }[]} */
  const out = [];
  URL_SPAN_RE.lastIndex = 0;
  let m;
  while ((m = URL_SPAN_RE.exec(text))) {
    const trimmed = m[0].replace(/[.,;:!?*]+$/, '');
    out.push({ start: m.index, end: m.index + trimmed.length });
  }
  return out;
}

/** @param {{ start: number, end: number }[]} spans @param {number} s @param {number} e */
function overlaps(spans, s, e) {
  return spans.some(x => s < x.end && e > x.start);
}

/**
 * Inventory data the proposals depend on.
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @returns {{ schemaIds: Set<string>, mcpTools: Set<string> }}
 */
export function loadInventoryData(ctx) {
  /** @type {Set<string>} */
  const schemaIds = new Set();
  /** @type {Set<string>} */
  const mcpTools = new Set();
  const schemaPath = join(ctx.root, 'port/state/inventory/schema.json');
  if (existsSync(schemaPath)) {
    try {
      const s = JSON.parse(readFileSync(schemaPath, 'utf8'));
      for (const group of [s.tables, s.materializedViews, s.views]) {
        for (const t of group ?? []) {
          if (t?.name) schemaIds.add(t.name);
          for (const c of t?.columns ?? []) if (c?.name) schemaIds.add(c.name);
        }
      }
    } catch {
      ctx.warn('W_JSON_PARSE', 'Invalid schema.json', 'port/state/inventory/schema.json');
    }
  }
  const epPath = join(ctx.root, 'port/state/inventory/entrypoints.json');
  if (existsSync(epPath)) {
    try {
      const e = JSON.parse(readFileSync(epPath, 'utf8'));
      for (const p of e.entryPoints ?? []) if (p.kind === 'mcp_tool') mcpTools.add(p.key);
    } catch {
      ctx.warn('W_JSON_PARSE', 'Invalid entrypoints.json', 'port/state/inventory/entrypoints.json');
    }
  }
  return { schemaIds, mcpTools };
}

/**
 * @typedef {{ path: string, token: string, start: number, end: number, line: string,
 *   kind: 'run' | 'phrase', terms: string[] }} TokenOcc
 */

/**
 * Token occurrences in one file: string contexts in source files, anywhere in other text files.
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {string} path
 * @param {string} text
 * @param {{ schemaIds: Set<string> }} data
 * @returns {TokenOcc[]}
 */
export function findTokenOccurrences(ctx, path, text, data) {
  if (!QUICK.test(text)) return [];
  /** @type {TokenOcc[]} */
  const out = [];
  /** @type {{ start: number, end: number }[]} */
  let regions;
  if (isSourceFile(path)) {
    regions = sourceRanges(ctx, path, text)
      .filter(r => r.kind === 'string')
      .map(r => ({ start: r.start, end: r.end }));
  } else {
    regions = [{ start: 0, end: text.length }];
  }
  const urls = urlSpans(text);
  // Image variables in .env files belong to `apply docker`, which matches the original values.
  if (isEnvFile(path)) {
    const re = /^[ \t]*(?:export[ \t]+)?[A-Za-z0-9_]*(?:^|_)(?:IMAGE_REPO|IMAGE_NAME_DOCKERHUB)=.*$/gm;
    let em;
    while ((em = re.exec(text))) urls.push({ start: em.index, end: em.index + em[0].length });
  }
  const scoped = [];
  SCOPED_RE.lastIndex = 0;
  let sm;
  while ((sm = SCOPED_RE.exec(text))) {
    if (/^@(hyperdx|clickhouse)\//i.test(sm[0])) scoped.push({ start: sm.index, end: sm.index + sm[0].length });
  }
  const termRe = new RegExp(TERM_RE_SRC, 'gi');
  const phraseRe = new RegExp(PHRASE_RE_SRC, 'gi');

  for (const region of regions) {
    const slice = text.slice(region.start, region.end);
    // Phrases first.
    phraseRe.lastIndex = 0;
    let pm;
    while ((pm = phraseRe.exec(slice))) {
      const s = region.start + pm.index;
      const e = s + pm[0].length;
      if (overlaps(urls, s, e)) continue;
      out.push({ path, token: pm[0], start: s, end: e, line: lineAt(text, s), kind: 'phrase', terms: [pm[0].toLowerCase()] });
    }
    RUN_RE.lastIndex = 0;
    let m;
    while ((m = RUN_RE.exec(slice))) {
      const raw = m[0];
      termRe.lastIndex = 0;
      // The term test uses the untrimmed run so that `--hdx` is not standalone.
      if (!termRe.test(raw)) continue;
      const lead = raw.length - raw.replace(/^[.-]+/, '').length;
      const trimmed = raw.replace(/^[.-]+/, '').replace(/[.-]+$/, '');
      if (!trimmed) continue;
      const s = region.start + m.index + lead;
      const e = s + trimmed.length;
      if (overlaps(urls, s, e)) continue;
      if (overlaps(scoped, s, e)) continue;
      if (ENV_NAME_RE.test(trimmed)) continue;
      if (data.schemaIds.has(trimmed)) continue;
      // Does the trimmed token still hold a term?
      const terms = [];
      termRe.lastIndex = 0;
      let tm;
      while ((tm = termRe.exec(trimmed))) terms.push(tm[0].toLowerCase());
      if (terms.length === 0) continue;
      out.push({ path, token: trimmed, start: s, end: e, line: lineAt(text, s), kind: 'run', terms });
    }
  }
  return out;
}

const QUICK = /hyperdx|clickstack|deploysentinel|\bhdx\b|ClickHouse,? Cloud|ClickHouse,? Inc/i;

/**
 * Where standalone `hdx` is proposed as the short slug.
 * @param {string} path
 */
function inCliOrDocs(path) {
  return (
    path.startsWith('packages/cli/') ||
    path.startsWith('docs/') ||
    path.startsWith('agent_docs/') ||
    /\.(md|mdx)$/.test(path)
  );
}

/**
 * Proposal for a token.
 * @param {import('./names.mjs').Names} names
 * @param {string} token
 * @param {string} path
 * @param {{ mcpTools: Set<string> }} data
 * @returns {{ replacement: string | null, status: 'proposed' | 'review' }}
 */
export function classifyToken(names, token, path, data) {
  if (/[ ,]/.test(token)) return { replacement: null, status: 'review' };
  if (isEmailToken(token) || isHostToken(token)) return { replacement: null, status: 'review' };
  if (/deploysentinel/i.test(token)) return { replacement: null, status: 'review' };
  if (token.startsWith('clickstack_') && data.mcpTools.has(token)) {
    return { replacement: names.MCP_PREFIX + token.slice('clickstack_'.length), status: 'proposed' };
  }
  const re = new RegExp(TERM_RE_SRC, 'gi');
  let review = false;
  const out = token.replace(re, (w, offset) => {
    if (w.toLowerCase() === 'hdx') {
      if (!inCliOrDocs(path)) review = true;
      return names.SHORT_SLUG;
    }
    if (w === w.toUpperCase()) return names.UPPER_NAME;
    if (w === w.toLowerCase()) {
      const before = token[offset - 1];
      const after = token[offset + w.length];
      return before === '_' || after === '_' ? names.SNAKE_NAME : names.PRODUCT_SLUG;
    }
    return token === w ? names.PRODUCT_NAME : names.PASCAL_NAME;
  });
  return { replacement: out, status: review ? 'review' : 'proposed' };
}

/**
 * @param {import('./names.mjs').Names} names
 * @returns {TokenEntry[]}
 */
function seedEntries(names) {
  /** @param {string} token @param {string | null} replacement @param {'proposed' | 'review'} status */
  const e = (token, replacement, status) => ({ token, replacement, status, reason: null, occurrences: 0, files: [] });
  return [
    e('ClickStack', names.PRODUCT_NAME, 'proposed'),
    e('HyperDX', names.PRODUCT_NAME, 'proposed'),
    e('clickstack', names.PRODUCT_SLUG, 'proposed'),
    e('hyperdx-release-notes', `${names.SHORT_SLUG}-release-notes`, 'proposed'),
    e('ClickHouse Cloud', null, 'review'),
  ];
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @returns {TokenMap | null}
 */
export function readTokenMap(ctx) {
  if (!ctx.exists(TOKEN_MAP_PATH)) return null;
  try {
    return JSON.parse(ctx.read(TOKEN_MAP_PATH));
  } catch {
    throw new ExitError(EXIT.TOKEN_MAP_INVALID, `${TOKEN_MAP_PATH} is not valid JSON`);
  }
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {TokenMap | null} existingMap
 * @returns {TokenMap}
 */
export function proposeTokens(ctx, existingMap) {
  const data = loadInventoryData(ctx);
  /** @type {Map<string, { entry: Partial<TokenEntry> & { token: string }, files: Set<string>, occ: number, props: Set<string>, review: boolean }>} */
  const found = new Map();
  for (const p of ctx.rewritable()) {
    const text = ctx.read(p);
    for (const o of findTokenOccurrences(ctx, p, text, data)) {
      let f = found.get(o.token);
      if (!f) {
        f = { entry: { token: o.token }, files: new Set(), occ: 0, props: new Set(), review: false };
        found.set(o.token, f);
      }
      f.occ++;
      f.files.add(p);
      const c = classifyToken(ctx.names, o.token, p, data);
      if (c.status === 'review') f.review = true;
      if (c.replacement !== null) f.props.add(c.replacement);
    }
  }

  /** @type {Map<string, TokenEntry>} */
  const entries = new Map();
  for (const s of seedEntries(ctx.names)) entries.set(s.token, s);
  for (const [token, f] of found) {
    const props = [...f.props];
    const conflict = f.review || props.length > 1;
    const base = entries.get(token);
    entries.set(token, {
      token,
      replacement: base && !conflict ? base.replacement : (props[0] ?? null),
      status: base ? base.status : conflict || props.length === 0 ? 'review' : 'proposed',
      reason: null,
      occurrences: 0,
      files: [],
    });
  }
  // Reviewed entries win over proposals.
  /** @type {Set<string>} */
  const keep = new Set();
  for (const old of existingMap?.entries ?? []) {
    if (old.status === 'approved' || old.status === 'allowed') {
      entries.set(old.token, { ...old, occurrences: 0, files: [] });
      keep.add(old.token);
    }
  }
  const result = [];
  for (const [token, e] of entries) {
    const f = found.get(token);
    const isSeed = seedEntries(ctx.names).some(s => s.token === token);
    if (!f && !keep.has(token) && !isSeed) continue;
    result.push({
      token,
      replacement: e.replacement,
      status: e.status,
      reason: e.reason,
      occurrences: f?.occ ?? 0,
      files: f ? [...f.files].sort(cmp).slice(0, 20) : [],
    });
  }
  result.sort((a, b) => cmp(a.token, b.token));
  return { schemaVersion: 1, entries: result };
}

/**
 * Open or malformed entries.
 * @param {TokenMap} map
 * @returns {string[]}
 */
export function tokenMapProblems(map) {
  /** @type {string[]} */
  const problems = [];
  if (!map || map.schemaVersion !== 1 || !Array.isArray(map.entries)) return ['token map is malformed'];
  for (const e of map.entries) {
    if (e.status === 'proposed' || e.status === 'review') problems.push(`${JSON.stringify(e.token)}: status is ${e.status}`);
    else if (e.status === 'approved' && (typeof e.replacement !== 'string' || e.replacement === '')) {
      problems.push(`${JSON.stringify(e.token)}: approved without a replacement`);
    } else if (e.status === 'allowed' && !(e.reason && ALLOWLIST_REASONS.includes(e.reason))) {
      problems.push(`${JSON.stringify(e.token)}: allowed without a valid reason`);
    } else if (e.status !== 'approved' && e.status !== 'allowed') {
      problems.push(`${JSON.stringify(e.token)}: unknown status ${JSON.stringify(e.status)}`);
    }
  }
  return problems;
}

/**
 * Apply approved entries and copy allowed entries to the allowlist.
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {TokenMap} map
 * @returns {{ changed: string[], allowlistAdded: number }}
 */
export function applyTokens(ctx, map) {
  const problems = tokenMapProblems(map);
  if (problems.length > 0) {
    throw new ExitError(
      EXIT.TOKEN_MAP_INVALID,
      `Token map has ${problems.length} open or malformed entr${problems.length === 1 ? 'y' : 'ies'}:\n  ${problems.slice(0, 50).join('\n  ')}`,
    );
  }
  const data = loadInventoryData(ctx);
  const approved = new Map(map.entries.filter(e => e.status === 'approved').map(e => [e.token, /** @type {string} */ (e.replacement)]));
  const allowed = new Map(map.entries.filter(e => e.status === 'allowed').map(e => [e.token, e]));
  /** @type {string[]} */
  const changed = [];
  const allowlist = readAllowlist(ctx);
  let added = 0;
  const seen = new Set(allowlist.entries.map(a => `${a.path}\0${a.term}\0${a.snippet}`));

  for (const p of ctx.rewritable()) {
    const text = ctx.read(p);
    const occs = findTokenOccurrences(ctx, p, text, data);
    if (occs.length === 0) continue;
    /** @type {{ start: number, end: number, to: string }[]} */
    const edits = [];
    for (const o of occs) {
      const to = approved.get(o.token);
      if (to !== undefined) {
        edits.push({ start: o.start, end: o.end, to });
        continue;
      }
      const a = allowed.get(o.token);
      if (a) {
        for (const term of o.terms) {
          const snippet = o.line.slice(0, 160);
          const key = `${p}\0${term}\0${snippet}`;
          if (seen.has(key)) continue;
          seen.add(key);
          allowlist.entries.push({
            path: p,
            term,
            snippet,
            reason: /** @type {any} */ (a.reason),
            note: `Token ${JSON.stringify(a.token)} allowed in the token map`,
          });
          added++;
        }
      }
    }
    if (edits.length > 0) {
      edits.sort((a, b) => b.start - a.start);
      let next = text;
      for (const e of edits) next = next.slice(0, e.start) + e.to + next.slice(e.end);
      if (ctx.write(p, next)) changed.push(p);
    }
  }
  if (added > 0) writeAllowlist(ctx, allowlist);
  return { changed: changed.sort(cmp), allowlistAdded: added };
}

/**
 * Write the token map with stable formatting.
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {TokenMap} map
 */
export function writeTokenMap(ctx, map) {
  return ctx.write(TOKEN_MAP_PATH, JSON.stringify(map, null, 2) + '\n');
}

/**
 * Apply approved entries to a text, for the test diff check.
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {string} path
 * @param {string} text
 * @param {TokenMap} map
 * @param {{ schemaIds: Set<string> }} data
 */
export function applyTokensToText(ctx, path, text, map, data) {
  const approved = new Map(map.entries.filter(e => e.status === 'approved').map(e => [e.token, /** @type {string} */ (e.replacement)]));
  const occs = findTokenOccurrences(ctx, path, text, data);
  const edits = occs.filter(o => approved.has(o.token)).sort((a, b) => b.start - a.start);
  let next = text;
  for (const e of edits) next = next.slice(0, e.start) + approved.get(e.token) + next.slice(e.end);
  return next;
}
