// Workspace rename.
import { spawnSync } from 'node:child_process';
import { closeSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cmp, EXIT, ExitError, escapeRe } from './names.mjs';
import { rewriteAll } from './textfiles.mjs';

const DEP_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

/**
 * Workspace package.json files from the root workspaces globs.
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @returns {{ name: string, dir: string, file: string }[]}
 */
export function listWorkspaces(ctx) {
  /** @type {any} */
  let root;
  try {
    root = JSON.parse(ctx.read('package.json'));
  } catch {
    return [];
  }
  const globs = Array.isArray(root.workspaces) ? root.workspaces : (root.workspaces?.packages ?? []);
  /** @type {Set<string>} */
  const dirs = new Set();
  for (const g of globs) {
    if (typeof g !== 'string') continue;
    const glob = g.replace(/^\.\//, '').replace(/\/+$/, '');
    if (glob.endsWith('/*')) {
      const prefix = glob.slice(0, -1);
      for (const f of ctx.files) {
        if (!f.startsWith(prefix) || !f.endsWith('/package.json')) continue;
        const rest = f.slice(prefix.length, -'/package.json'.length);
        if (rest && !rest.includes('/')) dirs.add(prefix + rest);
      }
    } else if (!glob.includes('*') && ctx.files.includes(`${glob}/package.json`)) dirs.add(glob);
  }
  /** @type {{ name: string, dir: string, file: string }[]} */
  const out = [];
  for (const dir of [...dirs].sort(cmp)) {
    try {
      const pkg = JSON.parse(ctx.read(`${dir}/package.json`));
      if (typeof pkg.name === 'string') out.push({ name: pkg.name, dir, file: `${dir}/package.json` });
    } catch {
      ctx.warn('W_JSON_PARSE', 'Invalid package.json', `${dir}/package.json`);
    }
  }
  return out;
}

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @returns {{ renames: { from: string, to: string, dir: string }[] }}
 */
export function planPackages(ctx) {
  const scope = ctx.names.NPM_SCOPE;
  /** @type {{ from: string, to: string, dir: string }[]} */
  const renames = [];
  for (const w of listWorkspaces(ctx)) {
    if (w.name.startsWith(scope + '/')) continue;
    const base = w.name.includes('/') ? w.name.slice(w.name.indexOf('/') + 1) : w.name;
    renames.push({ from: w.name, to: `${scope}/${base}`, dir: w.dir });
  }
  return { renames };
}

/**
 * Regex matching any renamed name followed by end of text or a non-name
 * character. The scope markers may also appear URL-encoded (`%40scope%2Fname`)
 * or with a backslash-escaped slash inside regex literals (`@scope\\/name`).
 * @param {{ from: string, to: string }[]} renames
 */
export function renameRegex(renames) {
  const alts = [...renames]
    .sort((a, b) => b.from.length - a.from.length)
    .map(r => escapeRe(r.from).replace(/@/g, '(?:@|%40)').replace(/\//g, '(?:\\\\?/|%2[Ff])'));
  return new RegExp(`(${alts.join('|')})(?![A-Za-z0-9_-])`, 'g');
}

/**
 * Apply renames to text, keeping the encoding style of each match.
 * @param {string} text
 * @param {{ from: string, to: string }[]} renames
 */
export function renameText(text, renames) {
  if (renames.length === 0) return text;
  const map = new Map(renames.map(r => [r.from, r.to]));
  return text.replace(renameRegex(renames), (_m, matched) => {
    const key = matched.replace('%40', '@').replace(/%2[Ff]|\\\//, '/');
    let to = map.get(key) ?? matched;
    if (to === matched) return matched;
    if (matched.includes('%40')) to = to.replace('@', '%40');
    const slash = /%2[Ff]|\\\//.exec(matched)?.[0];
    if (slash) to = to.replace('/', slash);
    return to;
  });
}

const GO_PREFIXES = /github\.com\/(ClickHouse\/ClickStack|hyperdxio\/hyperdx)/;

/**
 * @param {import('./textfiles.mjs').RCtx} ctx
 * @param {{ from: string, to: string, dir: string }[]} renames
 * @returns {{ changed: string[] }}
 */
export function applyPackages(ctx, renames) {
  /** @type {Set<string>} */
  const changed = new Set();

  // 2. Replace names in every non-exempt text file.
  for (const p of rewriteAll(ctx, text => renameText(text, renames))) changed.add(p);

  // 3. Internal dependencies become workspace:*.
  const newNames = new Set(renames.map(r => r.to));
  for (const w of listWorkspaces(ctx)) {
    const text = ctx.read(w.file);
    /** @type {any} */
    let pkg;
    try {
      pkg = JSON.parse(text);
    } catch {
      continue;
    }
    let touched = false;
    for (const s of DEP_SECTIONS) {
      const section = pkg[s];
      if (!section || typeof section !== 'object') continue;
      for (const k of Object.keys(section)) {
        if (newNames.has(k) && section[k] !== 'workspace:*') {
          section[k] = 'workspace:*';
          touched = true;
        }
      }
    }
    if (touched) {
      const indent = /^\{\n( +)"/.exec(text)?.[1].length ?? 2;
      const crlf = text.includes('\r\n');
      let out = JSON.stringify(pkg, null, indent) + (text.endsWith('\n') ? '\n' : '');
      if (crlf) out = out.replace(/\n/g, '\r\n');
      if (ctx.write(w.file, out)) changed.add(w.file);
    }
  }

  // 4. Go module path and imports.
  const target = `github.com/${ctx.names.ORIGIN_OWNER}/${ctx.names.ORIGIN_REPO}`;
  for (const p of ctx.rewritable()) {
    const isMod = p === 'go.mod' || p.endsWith('/go.mod');
    const isGo = p.endsWith('.go');
    if (!isMod && !isGo) continue;
    const text = ctx.read(p);
    if (!GO_PREFIXES.test(text)) continue;
    let next = text;
    if (isMod) {
      next = text.replace(
        /^(module\s+)github\.com\/(?:ClickHouse\/ClickStack|hyperdxio\/hyperdx)(?=[/\s]|$)/m,
        `$1${target}`,
      );
      // Requirements on the module's own sub-packages follow the same prefix.
      next = next.replace(
        /^(\s*(?:require\s+|replace\s+)?)github\.com\/(?:ClickHouse\/ClickStack|hyperdxio\/hyperdx)(?=\/)/gm,
        `$1${target}`,
      );
    } else {
      next = text.replace(
        /(["`])github\.com\/(?:ClickHouse\/ClickStack|hyperdxio\/hyperdx)(?=[/"`])/g,
        `$1${target}`,
      );
    }
    if (next !== text && ctx.write(p, next)) changed.add(p);
  }
  return { changed: [...changed].sort(cmp) };
}

/**
 * Run yarn with the Phase 1 child environment (already exported by rebrand.sh).
 * @param {string} root
 * @param {string[]} args
 * @param {string} logRel
 * @returns {number}
 */
export function runYarn(root, args, logRel) {
  const logAbs = join(root, logRel);
  mkdirSync(join(logAbs, '..'), { recursive: true });
  const fd = openSync(logAbs, 'a');
  try {
    const res = spawnSync('yarn', args, {
      cwd: root,
      stdio: ['ignore', fd, fd],
      env: { ...process.env, YARN_ENABLE_IMMUTABLE_INSTALLS: 'false' },
    });
    return res.status ?? 1;
  } finally {
    closeSync(fd);
  }
}

/**
 * Step 5: yarn install, immutable installs off.
 * @param {string} root
 * @param {(m: string) => void} log
 */
export function runInstall(root, log) {
  const installLog = 'port/state/logs/rebrand-install.log';
  mkdirSync(join(root, 'port/state/logs'), { recursive: true });
  closeSync(openSync(join(root, installLog), 'w'));
  log(`Running yarn install (log: ${installLog})`);
  if (runYarn(root, ['install'], installLog) !== 0) {
    throw new ExitError(EXIT.INSTALL_FAILED, `yarn install failed; see ${installLog}`);
  }
}

/**
 * Re-run the repository formatter (eslint --fix through the root `lint:fix`
 * script). Longer names change prettier line breaks and import ordering; the
 * formatter output is part of the rename. Remaining lint problems are left to
 * check.sh, so a non-zero exit is only a warning.
 * @param {string} root
 * @param {(m: string) => void} log
 * @returns {boolean} true when the formatter ran and exited 0
 */
export function runLintFix(root, log) {
  let scripts = {};
  try {
    scripts = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).scripts ?? {};
  } catch {
    return false;
  }
  if (!scripts['lint:fix']) return false;
  const lf = 'port/state/logs/rebrand-lintfix.log';
  mkdirSync(join(root, 'port/state/logs'), { recursive: true });
  closeSync(openSync(join(root, lf), 'w'));
  log(`Running yarn lint:fix (log: ${lf})`);
  const status = runYarn(root, ['lint:fix'], lf);
  if (status !== 0) log(`W_LINT_FIX: yarn lint:fix exited ${status}; see ${lf}`);
  return status === 0;
}

/**
 * Step 7: regenerate openapi.json through the API workspace's docgen script.
 * @param {string} root
 * @param {string} apiName
 * @param {(m: string) => void} log
 */
export function runDocgen(root, apiName, log) {
  const dg = 'port/state/logs/rebrand-docgen.log';
  mkdirSync(join(root, 'port/state/logs'), { recursive: true });
  closeSync(openSync(join(root, dg), 'w'));
  log(`Running yarn workspace ${apiName} docgen (log: ${dg})`);
  if (runYarn(root, ['workspace', apiName, 'docgen'], dg) !== 0) {
    throw new ExitError(EXIT.INSTALL_FAILED, `docgen failed; see ${dg}`);
  }
}
