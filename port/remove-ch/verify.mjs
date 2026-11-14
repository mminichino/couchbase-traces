#!/usr/bin/env node
/**
 * Phase 10 verification: port/remove-ch/verify.mjs
 * Exit 0 only when every check in PHASE_10_SPEC §10 passes.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const ALLOWLIST_PATH = join(ROOT, 'port/remove-ch/allowlist.json');
const KNIP_BEFORE_PATH = join(ROOT, 'port/state/remove-ch/knip-before.json');
const FEATURES_PATH = join(ROOT, 'port/features.json');

const ALLOWED_REASONS = new Set([
  'upstream_attribution',
  'retained_dependency',
  'port_history',
  'type_vocabulary',
]);

const TEXT_RE = /clickhouse|clickstack|chSql/gi;
const FORBIDDEN_NPM = [
  '@clickhouse/client',
  '@clickhouse/client-web',
  '@clickhouse/client-common',
];

/** @type {{ check: string, message: string }[]} */
const failures = [];

function fail(check, message) {
  failures.push({ check, message });
}

function readJson(abs) {
  return JSON.parse(readFileSync(abs, 'utf8'));
}

function gitTrackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  });
  const files = [];
  let start = 0;
  for (let i = 0; i < out.length; i++) {
    if (out[i] === 0) {
      files.push(out.subarray(start, i).toString('utf8'));
      start = i + 1;
    }
  }
  return files.filter(Boolean);
}

/** @param {string} globPath */
function globToRegExp(globPath) {
  let i = 0;
  let out = '^';
  while (i < globPath.length) {
    if (globPath.startsWith('**/', i)) {
      out += '(?:.*/)?';
      i += 3;
      continue;
    }
    if (globPath.startsWith('**', i)) {
      // trailing or bare ** → any remaining path including empty
      out += '.*';
      i += 2;
      continue;
    }
    if (globPath[i] === '*') {
      out += '[^/]*';
      i += 1;
      continue;
    }
    if (globPath[i] === '?') {
      out += '[^/]';
      i += 1;
      continue;
    }
    const ch = globPath[i];
    if (/[.+^${}()|[\]\\]/.test(ch)) out += `\\${ch}`;
    else out += ch;
    i += 1;
  }
  out += '$';
  return new RegExp(out);
}

/** @param {string} filePath @param {string} pattern */
function pathMatches(filePath, pattern) {
  const norm = filePath.split(sep).join('/');
  const pat = pattern.split(sep).join('/');
  if (!pat.includes('*') && !pat.includes('?')) return norm === pat;
  return globToRegExp(pat).test(norm);
}

function isBinaryBuffer(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

const KNIP_COUNT_KEYS = [
  'files',
  'exports',
  'dependencies',
  'devDependencies',
  'optionalPeerDependencies',
  'namespaceMembers',
  'nsExports',
  'types',
  'binaries',
  'catalog',
];

function knipMetric(payload) {
  const issues = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.issues)
      ? payload.issues
      : [];
  let total = 0;
  for (const issue of issues) {
    for (const key of KNIP_COUNT_KEYS) {
      const val = issue[key];
      if (Array.isArray(val)) total += val.length;
    }
  }
  return total;
}

function runCapture(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
  return r;
}

// ---------------------------------------------------------------------------
// Load allowlist
// ---------------------------------------------------------------------------
if (!existsSync(ALLOWLIST_PATH)) {
  fail('allowlist', `missing ${relative(ROOT, ALLOWLIST_PATH)}`);
  printAndExit();
}

const allowlist = readJson(ALLOWLIST_PATH);
if (allowlist.schemaVersion !== 1 || !Array.isArray(allowlist.entries)) {
  fail('allowlist', 'schemaVersion must be 1 and entries must be an array');
  printAndExit();
}

for (const [i, e] of allowlist.entries.entries()) {
  if (!e || typeof e !== 'object') {
    fail('allowlist', `entries[${i}] is not an object`);
    continue;
  }
  for (const k of ['path', 'pattern', 'reason', 'note']) {
    if (typeof e[k] !== 'string' || e[k].length === 0) {
      fail('allowlist', `entries[${i}] missing string ${k}`);
    }
  }
  if (e.reason && !ALLOWED_REASONS.has(e.reason)) {
    fail(
      'allowlist',
      `entries[${i}] reason ${JSON.stringify(e.reason)} not in ${[...ALLOWED_REASONS].join('|')}`,
    );
  }
}

/** @type {{ path: string, pattern: string, reason: string, note: string, re: RegExp, used: boolean }[]} */
const entries = allowlist.entries.map(e => ({
  ...e,
  re: new RegExp(e.pattern, 'i'),
  used: false,
}));

function coverMatch(filePath, lineOrFile) {
  for (const e of entries) {
    if (!pathMatches(filePath, e.path)) continue;
    if (!e.re.test(lineOrFile)) continue;
    e.used = true;
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 1. Text scan
// ---------------------------------------------------------------------------
{
  const files = gitTrackedFiles();
  /** @type {string[]} */
  const uncovered = [];
  for (const rel of files) {
    const abs = join(ROOT, rel);
    let st;
    try {
      st = statSync(abs);
    } catch {
      continue;
    }
    if (!st.isFile()) continue;
    let buf;
    try {
      buf = readFileSync(abs);
    } catch {
      continue;
    }
    if (isBinaryBuffer(buf)) continue;
    const text = buf.toString('utf8');
    if (!TEXT_RE.test(text)) {
      TEXT_RE.lastIndex = 0;
      continue;
    }
    TEXT_RE.lastIndex = 0;

    // Whole-file cover first
    if (coverMatch(rel, text)) continue;

    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      TEXT_RE.lastIndex = 0;
      if (!TEXT_RE.test(line)) continue;
      TEXT_RE.lastIndex = 0;
      if (coverMatch(rel, line)) continue;
      uncovered.push(`${rel}:${i + 1}: ${line.trim().slice(0, 160)}`);
    }
  }

  if (uncovered.length > 0) {
    const shown = uncovered.slice(0, 80);
    fail(
      'Text',
      `${uncovered.length} uncovered match(es):\n  ${shown.join('\n  ')}${
        uncovered.length > shown.length
          ? `\n  ... and ${uncovered.length - shown.length} more`
          : ''
      }`,
    );
  }

  const unused = entries
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => !e.used);
  if (unused.length > 0) {
    fail(
      'Text',
      `${unused.length} unused allowlist entr${unused.length === 1 ? 'y' : 'ies'}:\n  ${unused
        .slice(0, 40)
        .map(
          ({ e, i }) =>
            `[${i}] ${e.path} / ${e.pattern} (${e.reason})`,
        )
        .join('\n  ')}${
        unused.length > 40 ? `\n  ... and ${unused.length - 40} more` : ''
      }`,
    );
  }
}

// ---------------------------------------------------------------------------
// 2. npm forbidden clients
// ---------------------------------------------------------------------------
{
  const files = gitTrackedFiles().filter(
    f => f === 'yarn.lock' || /(^|\/)package\.json$/.test(f),
  );
  for (const rel of files) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    for (const dep of FORBIDDEN_NPM) {
      // Substring as dependency names — avoid matching @clickhouse/click-ui etc.
      // Match exact package name boundaries in lock/json text.
      const re = new RegExp(
        `(?:^|[\\s"',@{])${dep.replace('/', '\\/')}(?:@|[\\s"',}]|$)`,
      );
      if (re.test(text) || text.includes(`"${dep}"`) || text.includes(`'${dep}'`)) {
        // yarn.lock lists as `"@clickhouse/client@npm:..."` or `@clickhouse/client@`
        if (
          text.includes(dep) &&
          !text.includes('@clickhouse/click-ui') // always true filter no-op; real check below
        ) {
          // More precise: look for the exact package token
          const tokenRe = new RegExp(
            `(["']|\\s)${dep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(["'@\\s:])`,
          );
          if (tokenRe.test(text)) {
            fail('npm', `${rel} still references ${dep}`);
          }
        }
      }
      // Direct substring check as specified
      if (text.includes(dep)) {
        // Exclude longer names that start with the forbidden name + suffix letter
        // e.g. @clickhouse/client-web contains @clickhouse/client — check carefully
        let idx = 0;
        while ((idx = text.indexOf(dep, idx)) !== -1) {
          const after = text[idx + dep.length];
          // If followed by '-' and more name chars, it may be a different package
          // unless dep itself includes that suffix. client vs client-web:
          // when searching for @clickhouse/client, skip if followed by '-'
          // (client-web / client-common). When searching client-web/common, exact.
          if (
            dep === '@clickhouse/client' &&
            (after === '-' || after === '/')
          ) {
            idx += dep.length;
            continue;
          }
          fail('npm', `${rel} still references ${dep}`);
          break;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Go module paths
// ---------------------------------------------------------------------------
{
  const candidates = gitTrackedFiles().filter(f => {
    const base = f.split('/').pop();
    if (base === 'go.mod' || base === 'go.sum' || base === 'builder-config.yaml') {
      return (
        f.startsWith('packages/otel-collector/') ||
        f === 'go.mod' ||
        f === 'go.sum' ||
        f === 'builder-config.yaml'
      );
    }
    return false;
  });
  for (const rel of candidates) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (/clickhouse/i.test(lines[i])) {
        fail('Go', `${rel}:${i + 1}: module path contains clickhouse: ${lines[i].trim()}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Images
// ---------------------------------------------------------------------------
{
  const files = gitTrackedFiles().filter(f => {
    const lower = f.toLowerCase();
    if (lower.includes('dockerfile')) return true;
    if (f.startsWith('.github/workflows/')) return true;
    if (/(^|\/)docker-compose[^/]*\.(yml|yaml)$/.test(f)) return true;
    if (/(^|\/)compose[^/]*\.(yml|yaml)$/.test(f)) return true;
    return false;
  });
  for (const rel of files) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (/clickhouse\//i.test(lines[i])) {
        fail(
          'Images',
          `${rel}:${i + 1}: clickhouse/ image/exporter reference: ${lines[i].trim().slice(0, 120)}`,
        );
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Branding
// ---------------------------------------------------------------------------
{
  const r = runCapture('bash', ['port/rebrand.sh', 'verify', 'branding']);
  if (r.status !== 0) {
    const out = `${r.stdout || ''}\n${r.stderr || ''}`.trim();
    fail(
      'Branding',
      `port/rebrand.sh verify branding exited ${r.status}\n${out.slice(0, 4000)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// 6. Dead code / knip
// ---------------------------------------------------------------------------
{
  if (!existsSync(KNIP_BEFORE_PATH)) {
    fail('Dead code', `missing ${relative(ROOT, KNIP_BEFORE_PATH)}`);
  } else {
    const before = knipMetric(readJson(KNIP_BEFORE_PATH));
    const r = runCapture('yarn', ['knip', '--reporter', 'json'], {
      env: { ...process.env, FORCE_COLOR: '0' },
    });
    let afterPayload;
    try {
      const out = (r.stdout || '').trim();
      // knip may print non-json warnings; find JSON
      const start = out.indexOf('{') >= 0 && out.indexOf('[') >= 0
        ? Math.min(
            out.indexOf('{') === -1 ? Infinity : out.indexOf('{'),
            out.indexOf('[') === -1 ? Infinity : out.indexOf('['),
          )
        : out.indexOf('{') !== -1
          ? out.indexOf('{')
          : out.indexOf('[');
      const jsonText = start >= 0 ? out.slice(start) : out;
      afterPayload = JSON.parse(jsonText);
    } catch (err) {
      fail(
        'Dead code',
        `yarn knip --reporter json did not return JSON (status ${r.status}): ${(r.stderr || r.stdout || '').slice(0, 2000)}`,
      );
      afterPayload = null;
    }
    if (afterPayload) {
      const after = knipMetric(afterPayload);
      if (after > before) {
        fail(
          'Dead code',
          `knip unused metric after (${after}) > before (${before})`,
        );
      } else {
        console.log(`Dead code: knip metric after=${after} before=${before} (ok)`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 7. Features
// ---------------------------------------------------------------------------
{
  const r = runCapture('bash', ['port/inventory.sh', 'render']);
  if (r.status !== 0) {
    fail(
      'Features',
      `port/inventory.sh render exited ${r.status}\n${`${r.stdout || ''}\n${r.stderr || ''}`.trim().slice(0, 4000)}`,
    );
  }
  if (!existsSync(FEATURES_PATH)) {
    fail('Features', 'port/features.json missing');
  } else {
    const features = readJson(FEATURES_PATH).features ?? [];
    const byId = new Map(features.map(f => [f.id, f]));
    for (const f of features) {
      if (!['ported', 'replaced', 'dropped'].includes(f.status)) {
        fail(
          'Features',
          `${f.id} status is ${f.status} (must be ported|replaced|dropped)`,
        );
        continue;
      }
      if (f.status === 'replaced') {
        const targetId = f.decision?.replacedBy;
        if (!targetId) {
          fail('Features', `replaced ${f.id} missing decision.replacedBy`);
        } else {
          const target = byId.get(targetId);
          if (!target || target.status !== 'ported') {
            fail(
              'Features',
              `replaced ${f.id} replacedBy ${targetId} must be ported (got ${target?.status ?? 'missing'})`,
            );
          }
        }
        if (!f.decision?.note) {
          fail('Features', `replaced ${f.id} missing decision.note`);
        }
      }
      if (f.status === 'dropped') {
        const d = f.decision;
        if (!d?.note || !d?.signedOffBy || !d?.date) {
          fail(
            'Features',
            `dropped ${f.id} missing sign-off (decision.note/signedOffBy/date)`,
          );
        }
      }
    }
  }
}

printAndExit();

function printAndExit() {
  if (failures.length === 0) {
    console.log('remove-ch verify: PASS (all checks)');
    process.exit(0);
  }
  console.error(`remove-ch verify: FAIL (${failures.length} failure(s))\n`);
  const byCheck = new Map();
  for (const f of failures) {
    if (!byCheck.has(f.check)) byCheck.set(f.check, []);
    byCheck.get(f.check).push(f.message);
  }
  for (const [check, msgs] of byCheck) {
    console.error(`## ${check}`);
    for (const m of msgs) console.error(`- ${m}`);
    console.error('');
  }
  process.exit(1);
}
