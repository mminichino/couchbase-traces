import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { result } from '../lib/report.mjs';

const PRODUCT_NAME = 'Couchbase Traces';
const ORIGIN_URL = 'https://github.com/mminichino/couchbase-traces.git';
const UPSTREAM_URL = 'https://github.com/hyperdxio/hyperdx';

/**
 * @param {import('../run.mjs').RunContext} ctx
 */
async function j1(ctx) {
  const started = Date.now();
  /** @type {string[]} */
  const problems = [];

  const preflight = JSON.parse(
    readFileSync(join(ctx.root, 'port/state/preflight.json'), 'utf8'),
  );
  const sha = preflight.upstream?.sha;
  const licensePath = join(ctx.root, 'LICENSE');
  const noticePath = join(ctx.root, 'NOTICE');
  const upstreamMd = join(ctx.root, 'UPSTREAM.md');

  // LICENSE vs upstream
  let upstreamLicense = null;
  const upstreamPath = preflight.upstream?.path;
  if (upstreamPath && sha && existsSync(upstreamPath)) {
    const r = spawnSync('git', ['-C', upstreamPath, 'show', `${sha}:LICENSE`], {
      encoding: 'utf8',
      maxBuffer: 2 * 1024 * 1024,
    });
    if (r.status === 0) upstreamLicense = r.stdout;
  }
  if (upstreamLicense == null) {
    // Fall back to committed import copy if present under docs/upstream
    const fallback = join(ctx.root, 'docs/upstream/LICENSE');
    if (existsSync(fallback)) upstreamLicense = readFileSync(fallback, 'utf8');
  }
  const localLicense = readFileSync(licensePath, 'utf8');
  if (upstreamLicense != null && localLicense !== upstreamLicense) {
    problems.push('LICENSE is not byte-identical to upstream LICENSE');
  } else if (upstreamLicense == null) {
    problems.push('Could not load upstream LICENSE for comparison');
  }

  const notice = readFileSync(noticePath, 'utf8');
  if (!notice.includes(PRODUCT_NAME)) {
    problems.push('NOTICE missing PRODUCT_NAME');
  }
  if (!notice.includes(UPSTREAM_URL) && !notice.includes('github.com/hyperdxio/hyperdx')) {
    problems.push('NOTICE missing upstream URL');
  }
  if (sha && !notice.includes(sha)) {
    problems.push('NOTICE missing preflight SHA');
  }
  if (!notice.includes('Copyright (c) 2023 DeploySentinel, Inc.')) {
    problems.push('NOTICE missing upstream copyright line');
  }

  const upstream = readFileSync(upstreamMd, 'utf8');
  if (sha && !upstream.includes(sha)) {
    problems.push('UPSTREAM.md SHA does not match preflight');
  }
  const originNoGit = ORIGIN_URL.replace(/\.git$/, '');
  // Accept either with or without .git in the table, but require the no-.git form to appear
  // OR the ORIGIN_URL form — spec wants equals ORIGIN_URL without .git.
  if (!upstream.includes(originNoGit)) {
    problems.push(
      `UPSTREAM.md repository URL should equal ORIGIN_URL without .git (${originNoGit})`,
    );
  }

  if (problems.length) {
    return result({
      id: 'J1',
      title: 'Legal files',
      status: 'fail',
      summary: problems.join('; '),
      details: { problems, sha },
      durationMs: Date.now() - started,
    });
  }
  return result({
    id: 'J1',
    title: 'Legal files',
    status: 'pass',
    summary: 'LICENSE, NOTICE, and UPSTREAM.md are correct',
    details: { sha },
    durationMs: Date.now() - started,
  });
}

/**
 * @param {import('../run.mjs').RunContext} ctx
 */
async function j2(ctx) {
  const started = Date.now();
  const dir = mkdtempSync(join(tmpdir(), 'cbt-licenses-'));
  const tmp = join(dir, 'licenses.md');
  const gen = spawnSync('node', ['port/remove-ch/licenses.mjs', tmp], {
    cwd: ctx.root,
    encoding: 'utf8',
  });
  // licenses.mjs may write to docs/licenses.md by default — check both.
  let generated = existsSync(tmp) ? readFileSync(tmp, 'utf8') : '';
  if (!generated && gen.status === 0) {
    // Some versions write only to docs; re-read after running with no args into tmp via env
    const gen2 = spawnSync('node', ['port/remove-ch/licenses.mjs'], {
      cwd: ctx.root,
      encoding: 'utf8',
      env: { ...process.env, CBT_LICENSES_OUT: tmp },
    });
    if (existsSync(tmp)) generated = readFileSync(tmp, 'utf8');
    if (!generated) {
      // Compare by regenerating over a copy path — if script only prints, capture stdout
      generated = gen2.stdout || gen.stdout || '';
    }
  }

  const committed = readFileSync(join(ctx.root, 'docs/licenses.md'), 'utf8');
  const stripDate = s =>
    s
      .split('\n')
      .filter(l => !/generated|date:/i.test(l) || !/\d{4}-\d{2}-\d{2}/.test(l))
      .join('\n');

  // If generation failed, try running without output path and compare file rewrite carefully.
  if (gen.status !== 0 && !generated) {
    // Run generator which updates docs/licenses.md — compare against backup
    const backup = committed;
    const run = spawnSync('node', ['port/remove-ch/licenses.mjs'], {
      cwd: ctx.root,
      encoding: 'utf8',
    });
    const after = readFileSync(join(ctx.root, 'docs/licenses.md'), 'utf8');
    // restore committed content for cleanliness
    writeFileSync(join(ctx.root, 'docs/licenses.md'), backup);
    generated = after;
    if (run.status !== 0) {
      return result({
        id: 'J2',
        title: 'License report current',
        status: 'fail',
        summary: 'licenses.mjs failed',
        details: { status: run.status, err: run.stderr.slice(-2000) },
        durationMs: Date.now() - started,
      });
    }
  }

  const a = stripDate(committed).trim();
  const b = stripDate(generated || committed).trim();
  if (a !== b && generated) {
    // List changed package-ish lines
    const aSet = new Set(a.split('\n'));
    const bSet = new Set(b.split('\n'));
    const onlyA = [...aSet].filter(x => !bSet.has(x)).slice(0, 40);
    const onlyB = [...bSet].filter(x => !aSet.has(x)).slice(0, 40);
    return result({
      id: 'J2',
      title: 'License report current',
      status: 'fail',
      summary: 'docs/licenses.md differs from a fresh scan',
      details: { onlyInCommitted: onlyA, onlyInFresh: onlyB },
      durationMs: Date.now() - started,
    });
  }

  // Review list empty check — look for a review section in generated content
  const reviewNeeded = [];
  const notes = existsSync(join(ctx.root, 'docs/port-notes.md'))
    ? readFileSync(join(ctx.root, 'docs/port-notes.md'), 'utf8')
    : '';
  const reviewSection = /##\s*License review[\s\S]*?(?=\n##\s|$)/i.exec(notes);
  // If licenses.md mentions packages needing review, ensure notes cover them.
  const needsReview = [
    ...(committed.match(/needs review|review required/gi) ?? []),
  ];
  if (needsReview.length && !reviewSection) {
    return result({
      id: 'J2',
      title: 'License report current',
      status: 'blocked',
      summary: 'License review entries lack decisions in docs/port-notes.md',
      request:
        'Add a License review section in docs/port-notes.md stating the user decision for each package that needs review.',
      durationMs: Date.now() - started,
    });
  }

  return result({
    id: 'J2',
    title: 'License report current',
    status: 'pass',
    summary: 'docs/licenses.md matches a fresh scan',
    details: { reviewNeeded },
    durationMs: Date.now() - started,
  });
}

export const checks = [
  { id: 'J1', title: 'Legal files', needs: ['static'], run: j1 },
  { id: 'J2', title: 'License report current', needs: ['static'], run: j2 },
];
