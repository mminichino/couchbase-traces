import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { result } from '../lib/report.mjs';

const REQUIRED_DOCS = [
  'docs/development.md',
  'docs/capella.md',
  'docs/self-managed.md',
  'docs/indexes.md',
  'docs/data-model.md',
  'docs/sqlpp-mapping.md',
  'docs/parity.md',
  'docs/licenses.md',
];

/**
 * @param {import('../run.mjs').RunContext} ctx
 */
async function m1(ctx) {
  const started = Date.now();
  const cmds = [
    { name: 'port/check.sh', cmd: ['bash', 'port/check.sh'] },
    { name: 'port/golden/run.sh', cmd: ['bash', 'port/golden/run.sh'] },
    {
      name: 'port/couchbase-test/run.sh',
      cmd: ['bash', 'port/couchbase-test/run.sh'],
    },
  ];

  /** @type {object[]} */
  const results = [];
  let failed = false;
  /** @type {Set<string>} */
  const passed = new Set();
  /** @type {Set<string>} */
  const failedSet = new Set();

  for (const c of cmds) {
    if (!existsSync(join(ctx.root, c.cmd[1] ?? c.name))) {
      results.push({ name: c.name, status: 'missing' });
      failed = true;
      continue;
    }
    ctx.log(`M1: ${c.name}`);
    const r = spawnSync(c.cmd[0], c.cmd.slice(1), {
      cwd: ctx.root,
      encoding: 'utf8',
      timeout: 600_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    results.push({
      name: c.name,
      status: r.status,
      out: (r.stdout || '').slice(-2000),
      err: (r.stderr || '').slice(-2000),
    });
    if (r.status === 0) passed.add(c.name);
    else {
      failed = true;
      failedSet.add(c.name);
    }
  }

  // Full e2e as in workflow — may be heavy; attempt documented make target.
  const e2e = spawnSync('bash', ['-lc', 'make e2e 2>&1 | tail -n 80'], {
    cwd: ctx.root,
    encoding: 'utf8',
    timeout: 1_800_000,
  });
  results.push({
    name: 'make e2e',
    status: e2e.status,
    out: (e2e.stdout || '').slice(-2000),
  });
  if (e2e.status !== 0) {
    failed = true;
    failedSet.add('make e2e');
  } else {
    passed.add('make e2e');
  }

  ctx.testResults = {
    overallPass: !failed,
    passed,
    failed: failedSet,
  };

  return result({
    id: 'M1',
    title: 'Regression',
    status: failed ? 'fail' : 'pass',
    summary: failed
      ? `Regression failures: ${[...failedSet].join(', ')}`
      : 'Golden, check.sh, couchbase-test, and e2e passed',
    details: { results },
    durationMs: Date.now() - started,
  });
}

/**
 * @param {import('../run.mjs').RunContext} ctx
 */
async function m2(ctx) {
  const started = Date.now();
  /** @type {string[]} */
  const missing = [];
  /** @type {string[]} */
  const todos = [];
  for (const rel of REQUIRED_DOCS) {
    const p = join(ctx.root, rel);
    if (!existsSync(p)) {
      missing.push(rel);
      continue;
    }
    const text = readFileSync(p, 'utf8');
    // Hand-written docs: no TODO/TBD
    const generated = [
      'docs/indexes.md',
      'docs/data-model.md',
      'docs/sqlpp-mapping.md',
      'docs/parity.md',
      'docs/licenses.md',
    ].includes(rel);
    if (!generated && /\b(TODO|TBD)\b/.test(text)) {
      todos.push(rel);
    }
  }

  // Spot-check generated docs exist and are non-empty; full regen compare is
  // owned by their generators (indexes/data-model/sqlpp/parity/licenses).
  const stale = [];
  for (const rel of [
    'docs/indexes.md',
    'docs/data-model.md',
    'docs/sqlpp-mapping.md',
    'docs/parity.md',
    'docs/licenses.md',
  ]) {
    const p = join(ctx.root, rel);
    if (!existsSync(p)) continue;
    const text = readFileSync(p, 'utf8');
    if (text.trim().length < 50) stale.push(rel);
  }

  if (missing.length || todos.length || stale.length) {
    return result({
      id: 'M2',
      title: 'Docs',
      status: 'fail',
      summary: `missing=${missing.length} todo=${todos.length} stale=${stale.length}`,
      details: { missing, todos, stale },
      durationMs: Date.now() - started,
    });
  }
  return result({
    id: 'M2',
    title: 'Docs',
    status: 'pass',
    summary: 'All required docs exist; hand-written docs have no TODO/TBD',
    details: { docs: REQUIRED_DOCS },
    durationMs: Date.now() - started,
  });
}

export const checks = [
  { id: 'M1', title: 'Regression', needs: ['static'], run: m1 },
  { id: 'M2', title: 'Docs', needs: ['static'], run: m2 },
];
