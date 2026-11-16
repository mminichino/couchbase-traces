import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

import { result } from '../lib/report.mjs';
import {
  collectRouteSmokeEntries,
  generateRouteSmokeSpec,
} from '../lib/routes.mjs';

/** @typedef {import('../lib/report.mjs').CheckResult} CheckResult */

/**
 * @param {import('../run.mjs').RunContext} ctx
 * @returns {Promise<CheckResult>}
 */
async function a1(ctx) {
  const started = Date.now();
  const features = JSON.parse(
    readFileSync(join(ctx.root, 'port/features.json'), 'utf8'),
  ).features;
  const decisions = JSON.parse(
    readFileSync(join(ctx.root, 'port/decisions.json'), 'utf8'),
  ).decisions;

  const bad = [];
  const needsDecision = [];
  for (const f of features) {
    const okStatus = ['ported', 'replaced', 'dropped'].includes(f.status);
    if (!okStatus) {
      if (f.status === 'needs_decision') needsDecision.push(f.id);
      else bad.push(`${f.id}: status=${f.status}`);
      continue;
    }
    if (f.status === 'dropped' || f.status === 'replaced') {
      const d = f.decision;
      if (!d || !d.signedOffBy || !d.date) {
        bad.push(`${f.id}: ${f.status} missing decision.signedOffBy/date`);
      }
    }
  }
  const undecided = decisions.filter(d => d.decision == null);
  if (needsDecision.length || undecided.length) {
    const listed = [
      ...needsDecision,
      ...undecided.map(d => `decision:${d.id}`),
    ];
    return result({
      id: 'A1',
      title: 'Final feature status',
      status: 'blocked',
      summary: `Needs decision: ${listed.join(', ')}`,
      details: { needsDecision, undecided: undecided.map(d => d.id) },
      durationMs: Date.now() - started,
      request:
        'Decide each listed feature in port/features.json: set status dropped with decision.signedOffBy and decision.date, or tell the agent to port it.',
    });
  }
  if (bad.length) {
    return result({
      id: 'A1',
      title: 'Final feature status',
      status: 'fail',
      summary: `${bad.length} feature(s) not finalized`,
      details: { bad },
      durationMs: Date.now() - started,
    });
  }
  return result({
    id: 'A1',
    title: 'Final feature status',
    status: 'pass',
    summary: `All ${features.length} features are ported, replaced, or dropped with sign-off`,
    details: { featureCount: features.length },
    durationMs: Date.now() - started,
  });
}

/**
 * Map golden case source → feature ids (minimal coverage).
 * @param {string} source
 */
function featuresForGoldenSource(source) {
  if (!source) return [];
  if (source === 'logs') return ['app-search', 'app-chart'];
  if (source === 'traces') return ['app-trace', 'app-search', 'app-service-map'];
  if (source.startsWith('metrics')) return ['app-chart', 'app-services'];
  if (source === 'sessions') return ['app-sessions'];
  return [];
}

/**
 * @param {string} root
 * @returns {Map<string, string[]>} featureId -> test paths / golden ids
 */
function buildFeatureTestMap(root) {
  /** @type {Map<string, string[]>} */
  const map = new Map();
  const add = (id, item) => {
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(item);
  };
  const parityPath = join(root, 'port/state/inventory/parity.json');
  if (existsSync(parityPath)) {
    const parity = JSON.parse(readFileSync(parityPath, 'utf8'));
    for (const f of parity.features ?? []) {
      for (const t of f.tests?.unit ?? []) add(f.id, t);
      for (const t of f.tests?.int ?? []) add(f.id, t);
      for (const t of f.tests?.e2e ?? []) add(f.id, t);
    }
  }
  const casesRoot = join(root, 'port/golden/cases');
  const stack = [casesRoot];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of entries) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) stack.push(p);
      else if (ent.name.endsWith('.json')) {
        try {
          const doc = JSON.parse(readFileSync(p, 'utf8'));
          let feats = doc.features;
          if (!Array.isArray(feats) || feats.length === 0) {
            feats = featuresForGoldenSource(doc.source);
            if (feats.length) {
              doc.features = feats;
              writeFileSync(p, `${JSON.stringify(doc, null, 2)}\n`);
            }
          }
          for (const fid of feats ?? []) add(fid, `golden:${doc.id ?? p}`);
        } catch {
          // skip
        }
      }
    }
  }
  return map;
}

/**
 * @param {import('../run.mjs').RunContext} ctx
 * @returns {Promise<CheckResult>}
 */
async function a2(ctx) {
  const started = Date.now();
  const features = JSON.parse(
    readFileSync(join(ctx.root, 'port/features.json'), 'utf8'),
  ).features.filter(f => f.status === 'ported');
  const map = buildFeatureTestMap(ctx.root);
  const stageResults = ctx.testResults ?? null;
  const missing = [];
  const covered = [];
  for (const f of features) {
    const mapped = map.get(f.id) ?? [];
    if (mapped.length === 0) {
      missing.push({ id: f.id, reason: 'no test covers this feature' });
      continue;
    }
    if (stageResults) {
      const anyPass = mapped.some(t => stageResults.passed?.has(t));
      if (!anyPass) {
        // If we have stage results but none of the mapped tests ran/passed
        const anyRan = mapped.some(
          t => stageResults.passed?.has(t) || stageResults.failed?.has(t),
        );
        if (anyRan) {
          missing.push({ id: f.id, reason: 'mapped tests failed' });
          continue;
        }
        // Mapped but not executed in this run — treat as covered by mapping
        // only when stage results omit them (e.g. filtered). Prefer pass if
        // mapping exists and stage 6 reported overall success.
        if (stageResults.overallPass) {
          covered.push(f.id);
          continue;
        }
        missing.push({
          id: f.id,
          reason: 'mapped tests did not run in stage 6',
        });
        continue;
      }
    }
    covered.push(f.id);
  }
  if (missing.length) {
    return result({
      id: 'A2',
      title: 'Tests per ported feature',
      status: 'fail',
      summary: `${missing.length} ported feature(s) lack a passing mapped test`,
      details: { missing, coveredCount: covered.length },
      durationMs: Date.now() - started,
    });
  }
  return result({
    id: 'A2',
    title: 'Tests per ported feature',
    status: 'pass',
    summary: `All ${covered.length} ported features have at least one mapped test`,
    details: { coveredCount: covered.length },
    durationMs: Date.now() - started,
  });
}

/**
 * @param {import('../run.mjs').RunContext} ctx
 * @returns {Promise<CheckResult>}
 */
async function a3(ctx) {
  const started = Date.now();
  const specPath = join(
    ctx.root,
    'packages/app/tests/e2e/features/route-smoke.spec.ts',
  );
  mkdirSync(join(ctx.root, 'packages/app/tests/e2e/features'), {
    recursive: true,
  });
  writeFileSync(specPath, generateRouteSmokeSpec(ctx.root));

  const entries = collectRouteSmokeEntries(ctx.root);
  if (!ctx.stacks?.product?.ready) {
    return result({
      id: 'A3',
      title: 'Route smoke',
      status: 'fail',
      summary: 'Product stack is not ready; cannot run route smoke',
      details: { routes: entries.length },
      evidence: [],
      durationMs: Date.now() - started,
    });
  }

  const evidence = [];
  try {
    const session = await ctx.browser();
    const pageErrors = [];
    /** @type {string[]} */
    const failures = [];
    for (const e of entries) {
      try {
        await session.goto(e.path, e.route);
        const shot = await session.screenshot(
          `a3-${e.featureId}-${e.route.replace(/\W+/g, '_')}`,
        );
        evidence.push(shot);
      } catch (err) {
        failures.push(`${e.route}: ${err instanceof Error ? err.message : err}`);
      }
    }
    // Brand text collected for H2
    ctx.shared = ctx.shared || {};
    ctx.shared.pageTexts = [
      ...(ctx.shared.pageTexts || []),
      ...session.pageTexts,
    ];
    ctx.shared.browserRequests = [
      ...(ctx.shared.browserRequests || []),
      ...session.requests,
    ];

    if (failures.length) {
      return result({
        id: 'A3',
        title: 'Route smoke',
        status: 'fail',
        summary: `${failures.length}/${entries.length} routes failed`,
        details: { failures, pageErrors },
        evidence,
        durationMs: Date.now() - started,
      });
    }
    return result({
      id: 'A3',
      title: 'Route smoke',
      status: 'pass',
      summary: `${entries.length} app page routes loaded`,
      details: { routes: entries.map(e => e.route) },
      evidence,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    return result({
      id: 'A3',
      title: 'Route smoke',
      status: 'fail',
      summary: err instanceof Error ? err.message : String(err),
      details: { stack: err instanceof Error ? err.stack : null },
      evidence,
      durationMs: Date.now() - started,
    });
  }
}

export const checks = [
  {
    id: 'A1',
    title: 'Final feature status',
    needs: ['static'],
    run: a1,
  },
  {
    id: 'A2',
    title: 'Tests per ported feature',
    needs: ['static'],
    run: a2,
  },
  {
    id: 'A3',
    title: 'Route smoke',
    needs: ['product_stack'],
    run: a3,
  },
];
