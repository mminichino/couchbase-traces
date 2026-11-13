#!/usr/bin/env node
/**
 * Phase 10 gate: port/remove-ch/gate.mjs
 * Exit 0 only when every check in PHASE_10_SPEC §4.3 passes.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const failures = [];

function fail(msg) {
  failures.push(msg);
}

function readJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
}

function gitPorcelain() {
  return execFileSync('git', ['status', '--porcelain'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .map(l => l.trimEnd())
    .filter(Boolean);
}

// --- Slices ---
{
  const src = readFileSync(
    join(ROOT, 'packages/common-utils/src/dataLayer/index.ts'),
    'utf8',
  );
  const block = /export const COUCHBASE_SLICES[\s\S]*?= \{([\s\S]*?)\};/.exec(
    src,
  );
  if (!block) {
    fail('Slices: COUCHBASE_SLICES not found in dataLayer/index.ts');
  } else {
    const falses = [...block[1].matchAll(/(\w+)\s*:\s*false/g)].map(m => m[1]);
    if (falses.length > 0) {
      fail(`Slices: not all true: ${falses.join(', ')}`);
    }
  }
}

// --- Feature status ---
{
  const features = readJson('port/features.json').features ?? [];
  const allowed = new Set(['ported', 'replaced', 'dropped', 'needs_decision']);
  for (const f of features) {
    if (!allowed.has(f.status)) {
      fail(`Feature status: ${f.id} is ${f.status} (must be ported|replaced|dropped|needs_decision)`);
    }
    if (f.status === 'dropped') {
      const d = f.decision;
      if (!d?.note || !d?.signedOffBy || !d?.date) {
        fail(`Feature status: dropped ${f.id} missing decision.note/signedOffBy/date`);
      }
    }
    if (f.status === 'replaced') {
      const d = f.decision;
      if (!d?.note || !d?.replacedBy) {
        fail(`Feature status: replaced ${f.id} missing decision.note/replacedBy`);
      } else {
        const target = features.find(x => x.id === d.replacedBy);
        if (!target || target.status !== 'ported') {
          fail(
            `Feature status: replaced ${f.id} replacedBy ${d.replacedBy} must be ported (got ${target?.status ?? 'missing'})`,
          );
        }
      }
    }
  }

  // ClickHouse-dependent needs_decision must be settled
  for (const f of features) {
    if (f.status !== 'needs_decision') continue;
    fail(
      `ClickHouse-dependent decisions: ${f.id} is still needs_decision (must be dropped with sign-off or replaced)`,
    );
  }
}

// --- Local mode ---
{
  if (!existsSync(join(ROOT, 'port/decisions.json'))) {
    fail('Local mode: port/decisions.json missing');
  } else {
    const decisions = readJson('port/decisions.json').decisions ?? [];
    const local = decisions.find(d => d.id === 'local_mode');
    if (!local) {
      fail('Local mode: local_mode entry missing from decisions.json');
    } else if (local.decision === 'keep') {
      fail(
        'Local mode requires ClickHouse; Phase 10 cannot proceed while local mode is kept.',
      );
    } else if (local.decision !== 'drop') {
      fail(`Local mode: decision must be "drop" (got ${JSON.stringify(local.decision)})`);
    } else if (!local.signedOffBy || !local.date) {
      fail('Local mode: drop requires signedOffBy and date');
    }
  }
}

// --- Clean tree ---
{
  const dirty = gitPorcelain().filter(line => {
    // Allow only nothing — gate requires clean tracked tree
    return true;
  });
  if (dirty.length > 0) {
    fail(
      `Clean tree: modified/untracked files present:\n  ${dirty.slice(0, 20).join('\n  ')}${dirty.length > 20 ? `\n  …and ${dirty.length - 20} more` : ''}`,
    );
  }
}

// --- Tests (port/check.sh) ---
{
  const r = spawnSync('bash', ['port/check.sh', '--quiet'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 600_000,
  });
  if (r.status !== 0) {
    fail(
      `Tests: port/check.sh exited ${r.status}${r.stderr ? `: ${r.stderr.slice(0, 500)}` : ''}`,
    );
  }
}

// --- knip baseline (saved for later verify) ---
{
  const outDir = join(ROOT, 'port/state/remove-ch');
  mkdirSync(outDir, { recursive: true });
  const knip = spawnSync(
    'yarn',
    ['knip', '--reporter', 'json'],
    { cwd: ROOT, encoding: 'utf8', timeout: 300_000, shell: false },
  );
  const knipPath = join(outDir, 'knip-before.json');
  writeFileSync(
    knipPath,
    knip.stdout ||
      JSON.stringify({
        error: 'knip failed',
        status: knip.status,
        stderr: (knip.stderr || '').slice(0, 4000),
      }),
  );
  if (knip.status !== 0 && !knip.stdout) {
    // knip may exit non-zero when it finds issues; still save stdout if any
    console.error(
      `[gate] warning: knip exited ${knip.status}; baseline written to ${knipPath}`,
    );
  }
}

if (failures.length > 0) {
  console.error('Phase 10 gate FAILED:');
  for (const f of failures) console.error(`- ${f}`);
  process.exit(1);
}

console.log('Phase 10 gate PASSED');
process.exit(0);
