// Environment variable discovery and rename.
import { basename } from 'node:path';

import { cmp, isExempt, isReviewedFile } from './names.mjs';
import { extOf, isSourceFile, lineIndex, rewriteAll } from './textfiles.mjs';

export const ENV_NAME_RE = /^(NEXT_PUBLIC_)?(HYPERDX|HDX)_[A-Z0-9_]+$/;
const GENERIC = '([A-Z][A-Z0-9_]*)';
const QUICK = /HYPERDX|HDX/;

/**
 * @typedef {{ name: string, path: string, line: number, context: string }} EnvContext
 */

/** @param {string} p */
function isEnvFile(p) {
  const b = basename(p);
  return b === '.env' || b.startsWith('.env.') || b.endsWith('.env');
}

/** @param {string} p */
function isDockerfile(p) {
  const b = basename(p);
  return b.startsWith('Dockerfile') || b.endsWith('.dockerfile') || b.endsWith('.Dockerfile');
}

/** @param {string} p */
function isShellOrMake(p) {
  const b = basename(p);
  const e = extOf(p);
  return e === '.sh' || e === '.bash' || b === 'Makefile' || e === '.mk' || b === 'package.json';
}

/** @param {string} p */
function isYaml(p) {
  const e = extOf(p);
  return e === '.yml' || e === '.yaml';
}

/**
 * Names bound to `process.env`, and names destructured from it.
 * @param {string} text
 * @returns {{ aliases: string[], destructured: { name: string, index: number }[] }}
 */
function envBindings(text) {
  /** @type {string[]} */
  const aliases = [];
  const re = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*process\.env\b(?![.[])/g;
  let m;
  while ((m = re.exec(text))) aliases.push(m[1]);
  /** @type {{ name: string, index: number }[]} */
  const destructured = [];
  const dre = /\{([^{}]*)\}\s*(?::[^=;]+)?=\s*process\.env\b(?![.[])/g;
  while ((m = dre.exec(text))) {
    const inner = m[1];
    const base = m.index + 1;
    const ire = /(?:^|,)\s*(?:\.\.\.)?\s*([A-Za-z_$][\w$]*)/g;
    let im;
    while ((im = ire.exec(inner))) destructured.push({ name: im[1], index: base + im.index });
  }
  return { aliases, destructured };
}

/**
 * Collect candidate env names from one file as { name, offset, context }.
 * @param {string} path
 * @param {string} text
 * @returns {{ name: string, offset: number, context: string }[]}
 */
function scanFile(path, text) {
  /** @type {{ name: string, offset: number, context: string }[]} */
  const out = [];
  /**
   * @param {RegExp} re
   * @param {string} context
   * @param {number} [group]
   */
  const collect = (re, context, group = 1) => {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const name = m[group];
      if (name) out.push({ name, offset: m.index, context });
      if (m[0] === '') re.lastIndex++;
    }
  };

  if (isSourceFile(path)) {
    collect(new RegExp(`process\\.env\\.${GENERIC}`, 'g'), 'node');
    collect(new RegExp(`process\\.env\\[\\s*['"\`]${GENERIC}['"\`]\\s*\\]`, 'g'), 'node');
    collect(new RegExp(`(?<![\\w$.])env\\(\\s*['"\`]${GENERIC}['"\`]\\s*[,)]`, 'g'), 'node');
    const { aliases, destructured } = envBindings(text);
    for (const a of new Set(aliases.concat(/\benv\b\s*=\s*process\.env\b/.test(text) ? ['env'] : []))) {
      const esc = a.replace(/\$/g, '\\$');
      collect(new RegExp(`(?<![\\w$.])${esc}\\.${GENERIC}`, 'g'), 'node');
      collect(new RegExp(`(?<![\\w$.])${esc}\\[\\s*['"\`]${GENERIC}['"\`]\\s*\\]`, 'g'), 'node');
    }
    for (const d of destructured) if (/^[A-Z][A-Z0-9_]*$/.test(d.name)) out.push({ name: d.name, offset: d.index, context: 'node' });
  }

  // OpenTelemetry collector configuration syntax, in YAML files and in strings that generate it.
  collect(new RegExp(`\\$\\{env:${GENERIC}`, 'g'), 'collector');

  if (isEnvFile(path)) {
    collect(new RegExp(`^\\s*(?:export\\s+)?${GENERIC}=`, 'gm'), 'env_file');
  }

  if (isYaml(path)) {
    collect(new RegExp(`\\$\\{${GENERIC}(?:[:?+=-][^}]*)?\\}`, 'g'), 'compose');
    collect(new RegExp(`\\$\\{\\{\\s*env\\.${GENERIC}\\s*\\}\\}`, 'g'), 'workflow');
    collect(new RegExp(`^\\s*-\\s*['"]?${GENERIC}=`, 'gm'), 'compose');
    // Mapping keys under environment:, env:, or args:.
    const lines = text.split('\n');
    let off = 0;
    let blockIndent = -1;
    for (const line of lines) {
      const indent = line.length - line.trimStart().length;
      const t = line.trim();
      if (blockIndent >= 0) {
        if (t === '' || t.startsWith('#')) {
          off += line.length + 1;
          continue;
        }
        if (indent <= blockIndent) blockIndent = -1;
        else {
          const km = new RegExp(`^${GENERIC}\\s*:`).exec(t);
          if (km) out.push({ name: km[1], offset: off + indent, context: path.startsWith('.github/') ? 'workflow' : 'compose' });
        }
      }
      if (blockIndent < 0 && /^(?:environment|env|args)\s*:\s*(#.*)?$/.test(t)) blockIndent = indent;
      off += line.length + 1;
    }
  }

  if (isDockerfile(path)) {
    const re = /^\s*(?:ENV|ARG)\s+(.*)$/gm;
    let m;
    while ((m = re.exec(text))) {
      const rest = m[1];
      const base = m.index + m[0].length - rest.length;
      const single = new RegExp(`^${GENERIC}(?=\\s|$)`).exec(rest);
      if (single) out.push({ name: single[1], offset: base, context: 'docker' });
      const nre = new RegExp(`(?:^|\\s)${GENERIC}=`, 'g');
      let nm;
      while ((nm = nre.exec(rest))) out.push({ name: nm[1], offset: base + nm.index, context: 'docker' });
    }
    collect(new RegExp(`\\$\\{?${GENERIC}`, 'g'), 'docker');
  }

  if (isShellOrMake(path)) {
    collect(new RegExp(`\\$\\(${GENERIC}\\)`, 'g'), 'shell');
    collect(new RegExp(`\\$\\{${GENERIC}`, 'g'), 'shell');
    collect(new RegExp(`\\$${GENERIC}`, 'g'), 'shell');
    if (basename(path) !== 'package.json') {
      collect(new RegExp(`(?<![A-Za-z0-9_])${GENERIC}\\s*[:?+]?=(?!=)`, 'g'), 'shell');
      collect(new RegExp(`\\bexport\\s+${GENERIC}`, 'g'), 'shell');
    }
  }

  if (path.endsWith('.go')) {
    collect(new RegExp(`os\\.(?:Getenv|LookupEnv)\\(\\s*"${GENERIC}"\\s*\\)`, 'g'), 'go');
    // Local helpers such as getEnv("NAME", fallback) and t.Setenv("NAME", value).
    collect(new RegExp(`[A-Za-z_.]*[Ee]nv[A-Za-z]*\\(\\s*"${GENERIC}"\\s*[,)]`, 'g'), 'go');
  }

  if (path.startsWith('.github/')) {
    collect(new RegExp(`\\$\\{\\{\\s*env\\.${GENERIC}\\s*\\}\\}`, 'g'), 'workflow');
  }
  return out;
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @returns {{ names: string[], contexts: EnvContext[], embedded: string[], all: string[] }}
 */
export function discoverEnvVars(ctx) {
  /** @type {Set<string>} */
  const names = new Set();
  /** @type {Set<string>} */
  const embedded = new Set();
  /** @type {Set<string>} */
  const all = new Set();
  /** @type {EnvContext[]} */
  const contexts = [];
  for (const p of ctx.textFiles()) {
    if (isExempt(p) || isReviewedFile(p)) continue;
    const text = ctx.read(p);
    // Quick filter for brand names; the full name set is only needed for collisions.
    const hasBrand = QUICK.test(text);
    const hasPrefixed = /CBT_/.test(text);
    if (!hasBrand && !hasPrefixed) continue;
    const hits = scanFile(p, text);
    if (hits.length === 0) continue;
    const lineOf = lineIndex(text);
    for (const h of hits) {
      all.add(h.name);
      if (ENV_NAME_RE.test(h.name)) {
        names.add(h.name);
        contexts.push({ name: h.name, path: p, line: lineOf(h.offset), context: h.context });
      } else if (/(?:^|_)(?:HYPERDX|HDX)(?:_|$)/.test(h.name)) {
        embedded.add(h.name);
      }
    }
  }
  contexts.sort((a, b) => cmp(a.name, b.name) || cmp(a.path, b.path) || a.line - b.line);
  return { names: [...names].sort(cmp), contexts, embedded: [...embedded].sort(cmp), all: [...all].sort(cmp) };
}

/**
 * @param {string[]} names
 * @param {{ prefix?: string, existing?: Iterable<string> }} [opts]
 * @returns {{ renames: { from: string, to: string }[], collisions: string[] }}
 */
export function planEnvRenames(names, opts = {}) {
  const prefix = opts.prefix ?? 'CBT_';
  const existing = new Set(opts.existing ?? []);
  const sorted = [...new Set(names)].sort(cmp);
  /** @type {Map<string, string[]>} */
  const byTarget = new Map();
  /** @param {string} n */
  const parts = n => {
    const m = /^(NEXT_PUBLIC_)?(HYPERDX|HDX)_(.+)$/.exec(n);
    if (!m) throw new Error(`Not an env var name: ${n}`);
    return { pub: m[1] ?? '', kind: m[2], rest: m[3] };
  };
  for (const n of sorted) {
    const { pub, rest } = parts(n);
    const target = `${pub}${prefix}${rest}`;
    const arr = byTarget.get(target) ?? [];
    arr.push(n);
    byTarget.set(target, arr);
  }
  /** @type {{ from: string, to: string }[]} */
  const renames = [];
  /** @type {string[]} */
  const collisions = [];
  const taken = new Set([...byTarget.keys()]);
  for (const [target, group] of byTarget) {
    // HYPERDX_X takes the plain target; the others get the original kind kept.
    group.sort((a, b) => (parts(a).kind === 'HYPERDX' ? 0 : 1) - (parts(b).kind === 'HYPERDX' ? 0 : 1) || cmp(a, b));
    const first = group[0];
    const targetExists = existing.has(target) && !names.includes(target);
    for (let i = 0; i < group.length; i++) {
      const n = group[i];
      const { pub, kind, rest } = parts(n);
      let to = target;
      if (i > 0 || targetExists) {
        to = `${pub}${prefix}${kind}_${rest}`;
        collisions.push(`${n} -> ${to}`);
        if (i === 0 && targetExists) collisions[collisions.length - 1] += ` (${target} already exists)`;
      }
      taken.add(to);
      renames.push({ from: n, to });
    }
    void first;
  }
  renames.sort((a, b) => cmp(a.from, b.from));
  return { renames, collisions };
}

/**
 * Whole-token rename of env var names in a text.
 * @param {string} text
 * @param {{ from: string, to: string }[]} renames
 */
export function applyEnvRenamesToText(text, renames) {
  if (renames.length === 0) return text;
  const map = new Map(renames.map(r => [r.from, r.to]));
  const alts = [...map.keys()].sort((a, b) => b.length - a.length).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(?<![A-Za-z0-9_])(${alts.join('|')})(?![A-Za-z0-9_])`, 'g');
  return text.replace(re, (_m, n) => map.get(n) ?? n);
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {{ from: string, to: string }[]} renames
 * @returns {string[]} changed paths
 */
export function applyEnvRenames(ctx, renames) {
  if (renames.length === 0) return [];
  return rewriteAll(ctx, text => applyEnvRenamesToText(text, renames));
}
