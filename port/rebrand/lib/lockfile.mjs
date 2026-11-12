// yarn.lock parsing and drift check (Yarn Berry format).
import { renameRegex, renameText } from './packages.mjs';

/**
 * @typedef {{ resolution: string, version: string, checksum: string, body: string, deps: string }} LockEntry
 */

/** @param {string} v */
function unquote(v) {
  v = v.trim();
  if (v.startsWith('"') && v.endsWith('"')) {
    try {
      return JSON.parse(v);
    } catch {
      return v.slice(1, -1);
    }
  }
  return v;
}

/**
 * An entry starts at a non-indented line ending in `:`. Fields are the 2-space indented lines
 * that follow. `__metadata` is ignored.
 * @param {string} text
 * @returns {Map<string, LockEntry>}
 */
export function parseLockfile(text) {
  /** @type {Map<string, LockEntry>} */
  const out = new Map();
  const lines = text.split(/\r?\n/);
  /** @type {string | null} */
  let key = null;
  /** @type {string[]} */
  let body = [];
  const flush = () => {
    if (key === null) return;
    if (key !== '__metadata') {
      /** @type {Record<string, string>} */
      const f = {};
      let deps = [];
      let inDeps = false;
      for (const l of body) {
        const m = /^ {2}([A-Za-z][A-Za-z0-9]*):\s*(.*)$/.exec(l);
        if (m) {
          f[m[1]] = unquote(m[2]);
          inDeps = m[1] === 'dependencies';
          if (inDeps) deps.push(l);
        } else if (inDeps && l.startsWith('    ')) {
          deps.push(l);
        } else if (!l.startsWith('    ')) {
          inDeps = false;
        }
      }
      out.set(key, {
        resolution: f.resolution ?? '',
        version: f.version ?? '',
        checksum: f.checksum ?? '',
        body: body.join('\n'),
        deps: deps.join('\n'),
      });
    }
    key = null;
    body = [];
  };
  for (const line of lines) {
    if (line === '' || line.startsWith('#')) {
      if (line === '') continue;
      continue;
    }
    if (!/^\s/.test(line) && line.endsWith(':')) {
      flush();
      key = unquote(line.slice(0, -1));
    } else if (key !== null) {
      body.push(line);
    }
  }
  flush();
  return out;
}

/**
 * @param {string} baseText
 * @param {string} headText
 * @param {{ from: string, to: string, dir: string }[]} renames
 * @returns {string[]} problems
 */
export function lockfileDrift(baseText, headText, renames) {
  /** @type {string[]} */
  const problems = [];
  const base = parseLockfile(renameText(baseText, renames));
  const head = parseLockfile(headText);

  /** @param {Map<string, LockEntry>} m */
  const externals = m => {
    /** @type {Map<string, LockEntry>} */
    const r = new Map();
    for (const e of m.values()) {
      if (e.resolution.includes('@workspace:')) continue;
      r.set(`${e.resolution}\t${e.version}\t${e.checksum}`, e);
    }
    return r;
  };
  const be = externals(base);
  const he = externals(head);
  for (const [k, e] of be) {
    const h = he.get(k);
    if (!h) problems.push(`external entry missing or changed: ${e.resolution} (${e.version} ${e.checksum})`);
    else if (h.deps !== e.deps) problems.push(`external entry dependencies changed: ${e.resolution}`);
  }
  for (const [k, e] of he) {
    if (!be.has(k)) problems.push(`external entry added or changed: ${e.resolution} (${e.version} ${e.checksum})`);
  }

  for (const r of renames) {
    const want = `${r.to}@workspace:${r.dir}`;
    let n = 0;
    for (const e of head.values()) if (e.resolution === want) n++;
    if (n !== 1) problems.push(`expected exactly one workspace entry with resolution "${want}", found ${n}`);
  }
  if (renames.length > 0) {
    const old = renameRegex(renames);
    for (const [k, e] of head) {
      old.lastIndex = 0;
      if (old.test(k) || old.test(e.body)) problems.push(`entry still mentions an old workspace name: ${k}`);
    }
  }
  return problems;
}
