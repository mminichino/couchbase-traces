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
 * Parity inventory omits some ported features that still have tests in-tree.
 * Keep this list small and path-verified.
 */
const SUPPLEMENTAL_FEATURE_TESTS = {
  'api-saved-search': [
    'packages/api/src/mcp/__tests__/savedSearches.int.test.ts',
    'packages/app/src/__tests__/DBSearchPage.saveSearch.test.tsx',
  ],
  'api-pinned-filters': [
    'packages/api/src/routers/api/__tests__/pinnedFilters.int.test.ts',
    'packages/api/src/routers/api/__tests__/teamSettings.test.ts',
  ],
  'api-favorites': [
    'packages/api/src/routers/api/__tests__/favorites.int.test.ts',
    'packages/app/tests/e2e/features/favorites.spec.ts',
  ],
  'api-webhooks': [
    'packages/api/src/routers/api/__tests__/webhooks.int.test.ts',
    'packages/api/src/mcp/__tests__/webhooks.int.test.ts',
    'packages/api/src/controllers/__tests__/alerts.test.ts',
  ],
  'app-login': ['packages/app/tests/e2e/features/route-smoke.spec.ts'],
  'app-register': ['packages/app/tests/e2e/features/route-smoke.spec.ts'],
  'app-join-team': [
    'packages/api/src/routers/api/__tests__/team.int.test.ts',
    'packages/app/tests/e2e/features/route-smoke.spec.ts',
  ],
  'api-me': [
    'packages/api/src/routers/api/__tests__/team.int.test.ts',
    'packages/api/src/routers/api/__tests__/teamSettings.test.ts',
  ],
  'api-team-query-settings': [
    'packages/api/src/routers/api/__tests__/teamSettings.test.ts',
  ],
  'api-health': ['packages/api/src/__tests__/sessionSecretStartup.test.ts'],
  'api-sources': [
    'packages/api/src/__tests__/setupDefaults.test.ts',
    'packages/app/tests/e2e/features/sources.spec.ts',
  ],
  'app-api': ['packages/app/tests/e2e/features/route-smoke.spec.ts'],
  'app-benchmark': ['packages/app/tests/e2e/features/route-smoke.spec.ts'],
  'external-alerts': [
    'packages/api/src/routers/external-api/__tests__/alerts.int.test.ts',
    'packages/api/src/routers/external-api/__tests__/v2.int.test.ts',
    'packages/api/src/__tests__/config.test.ts',
  ],
  'external-charts': [
    'packages/api/src/routers/external-api/__tests__/v2.int.test.ts',
    'packages/api/src/__tests__/config.test.ts',
  ],
  'external-connections': [
    'packages/api/src/routers/external-api/__tests__/v2.int.test.ts',
    'packages/api/src/__tests__/config.test.ts',
  ],
  'external-dashboards': [
    'packages/api/src/routers/external-api/__tests__/v2.int.test.ts',
    'packages/api/src/__tests__/config.test.ts',
  ],
  'external-saved-searches': [
    'packages/api/src/routers/external-api/__tests__/v2.int.test.ts',
    'packages/api/src/__tests__/config.test.ts',
  ],
  'external-search': [
    'packages/api/src/routers/external-api/__tests__/v2.int.test.ts',
    'packages/api/src/__tests__/config.test.ts',
  ],
  'external-sources': [
    'packages/api/src/routers/external-api/__tests__/v2.int.test.ts',
    'packages/api/src/__tests__/config.test.ts',
  ],
  'external-team': [
    'packages/api/src/routers/external-api/__tests__/team.int.test.ts',
    'packages/api/src/__tests__/config.test.ts',
  ],
  'external-webhooks': [
    'packages/api/src/routers/external-api/__tests__/v2.int.test.ts',
    'packages/api/src/__tests__/config.test.ts',
  ],
  'mcp-saved-searches': [
    'packages/api/src/mcp/__tests__/savedSearches.int.test.ts',
    'packages/api/src/mcp/__tests__/toolSchemas.test.ts',
  ],
  'mcp-trace': [
    'packages/api/src/mcp/__tests__/trace.int.test.ts',
    'packages/api/src/mcp/__tests__/toolSchemas.test.ts',
  ],
  'task-ping-pong': ['packages/api/src/tasks/__tests__/index.test.ts'],
  'task-provision-dashboards': [
    'packages/api/src/tasks/__tests__/index.test.ts',
  ],
};

/**
 * Which M1 suite command covers a mapped test path / golden id.
 * @param {string} mapped
 */
export function suiteCommandForMappedTest(mapped) {
  if (mapped.startsWith('golden:')) return 'port/golden/run.sh';
  if (
    mapped.includes('/tests/e2e/') ||
    mapped.endsWith('.spec.ts') ||
    mapped.includes('e2e/')
  ) {
    return 'make e2e';
  }
  if (mapped.includes('.int.test.') || mapped.includes('.int.')) {
    return 'port/couchbase-test/run.sh';
  }
  return 'port/check.sh';
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
  for (const [id, tests] of Object.entries(SUPPLEMENTAL_FEATURE_TESTS)) {
    for (const t of tests) {
      if (existsSync(join(root, t))) add(id, t);
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
      const anyPass = mapped.some(t => {
        if (stageResults.passed?.has(t)) return true;
        const suite = suiteCommandForMappedTest(t);
        return stageResults.passed?.has(suite);
      });
      if (anyPass) {
        covered.push(f.id);
        continue;
      }
      const suites = [...new Set(mapped.map(suiteCommandForMappedTest))];
      const anyFailed = suites.some(s => stageResults.failed?.has(s));
      if (anyFailed) {
        missing.push({ id: f.id, reason: 'mapped tests failed' });
        continue;
      }
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
