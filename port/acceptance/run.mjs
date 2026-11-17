#!/usr/bin/env node
/**
 * Phase 11 acceptance runner.
 *
 * node port/acceptance/run.mjs [--only ids] [--skip ids] [--capella]
 *   [--keep-stack] [--reuse-stack] [--record-ci <url>]
 *
 * Exit: 0 all passed; 1 any failed; 2 any blocked and none failed; 3 runner error.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checks as a } from './checks/a.mjs';
import { checks as b } from './checks/b.mjs';
import { checks as c } from './checks/c.mjs';
import { checks as d } from './checks/d.mjs';
import { checks as e } from './checks/e.mjs';
import { checks as f } from './checks/f.mjs';
import { checks as g } from './checks/g.mjs';
import { checks as h } from './checks/h.mjs';
import { checks as i } from './checks/i.mjs';
import { checks as j } from './checks/j.mjs';
import { checks as k } from './checks/k.mjs';
import { checks as l } from './checks/l.mjs';
import { checks as m } from './checks/m.mjs';
import { createApiClient } from './lib/api.mjs';
import { openBrowserSession } from './lib/browser.mjs';
import {
  buildReport,
  computeReportStatus,
  writeReportArtifacts,
} from './lib/report.mjs';
import {
  dockerAvailable,
  dockerResources,
  downCapellaStack,
  downProductStack,
  prepareCapellaEnv,
  prepareProductEnv,
  upCapellaStack,
  upProductStack,
} from './lib/stack.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

const CHECK_ORDER = [
  'A1',
  'A2',
  'A3',
  'B1',
  'B2',
  'C1',
  'C2',
  'D1',
  'E1',
  'F1',
  'G1',
  'H1',
  'H2',
  'H3',
  'I1',
  'I2',
  'J1',
  'J2',
  'K1',
  'K2',
  'L1',
  'M1',
  'M2',
];

const ALL_CHECKS = [...a, ...b, ...c, ...d, ...e, ...f, ...g, ...h, ...i, ...j, ...k, ...l, ...m];
const BY_ID = new Map(ALL_CHECKS.map(c => [c.id, c]));

const STAGES = [
  { name: '1-static', stack: null, ids: ['A1', 'H1', 'J1', 'J2', 'L1', 'M2'] },
  {
    name: '2-product',
    stack: 'product',
    ids: ['B1', 'B2', 'A3', 'H2', 'H3', 'I1', 'I2', 'D1', 'E1', 'G1'],
  },
  { name: '3-perf', stack: 'perf', ids: ['F1'] },
  { name: '4-capella', stack: 'capella', ids: ['C1', 'C2'] },
  { name: '5-aio', stack: 'aio', ids: [] },
  { name: '6-tests', stack: null, ids: ['M1', 'A2', 'K1'] },
  { name: '7-ci', stack: null, ids: ['K2'] },
];

function parseArgs(argv) {
  /** @type {Record<string, string|boolean|undefined>} */
  const flags = {
    only: undefined,
    skip: undefined,
    capella: false,
    keepStack: false,
    reuseStack: false,
    recordCi: undefined,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--only') flags.only = argv[++i];
    else if (a === '--skip') flags.skip = argv[++i];
    else if (a === '--capella') flags.capella = true;
    else if (a === '--keep-stack') flags.keepStack = true;
    else if (a === '--reuse-stack') flags.reuseStack = true;
    else if (a === '--record-ci') flags.recordCi = argv[++i];
    else if (a === '--help' || a === '-h') flags.help = true;
  }
  return flags;
}

function selectIds(flags) {
  let ids = [...CHECK_ORDER];
  if (flags.only) {
    const only = String(flags.only)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    ids = ids.filter(id => only.includes(id));
  }
  if (flags.skip) {
    const skip = new Set(
      String(flags.skip)
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    );
    ids = ids.filter(id => !skip.has(id));
  }
  if (!flags.capella) {
    ids = ids.filter(id => id !== 'C1' && id !== 'C2');
  }
  return ids;
}

function log(msg) {
  console.log(`[acceptance] ${msg}`);
}

function gitHead(root) {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
  }
}

function loadCommittedReport(root) {
  const path = join(root, 'port/state/acceptance/report.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(`Usage: node port/acceptance/run.mjs [--only ids] [--skip ids] [--capella] [--keep-stack] [--reuse-stack] [--record-ci url]`);
    process.exit(0);
  }

  const headSha = gitHead(ROOT);
  const priorReport = loadCommittedReport(ROOT);
  // Spec §11.4: with --record-ci, reuse committed results when SHA is unchanged.
  const reuseForRecordCi = Boolean(
    flags.recordCi &&
      priorReport?.gitSha &&
      headSha &&
      priorReport.gitSha === headSha &&
      Array.isArray(priorReport.checks) &&
      priorReport.checks.length > 0,
  );

  let selected = new Set(selectIds(flags));
  let filtered = Boolean(flags.only || flags.skip);
  if (reuseForRecordCi) {
    selected = new Set(['K2']);
    filtered = false;
    log(
      `Reusing committed acceptance results for ${headSha.slice(0, 12)}; re-running K2 only`,
    );
  }

  const evidenceDir = join(ROOT, 'port/state/acceptance/evidence');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(join(evidenceDir, 'coredns'), { recursive: true });

  /** @type {any} */
  let browserSession = null;
  /** @type {ReturnType<typeof prepareProductEnv>|null} */
  let productEnv = null;
  /** @type {ReturnType<typeof prepareCapellaEnv>|null} */
  let capellaEnv = null;

  /** @type {any} */
  const stacks = {
    product: null,
    capella: null,
    dev: null,
  };

  /** @type {any} */
  const ctx = {
    root: ROOT,
    evidenceDir,
    stacks,
    flags: {
      capella: flags.capella,
      keepStack: flags.keepStack,
      reuseStack: flags.reuseStack,
      recordCi: flags.recordCi,
    },
    // When recording CI against a reused report, pin expected SHA to that report.
    reportGitSha: reuseForRecordCi ? priorReport.gitSha : headSha,
    shared: {
      capturePath: join(evidenceDir, 'statements.ndjson'),
      dnsLogPath: join(evidenceDir, 'coredns', 'query.log'),
      pageTexts: [],
      browserRequests: [],
    },
    testResults: null,
    api(stack) {
      const handle =
        (stack && stacks[stack]) || stacks.capella || stacks.product;
      const env = handle?.env || capellaEnv?.env || productEnv?.env;
      const base =
        handle?.apiOrigin ||
        `http://localhost:${env?.CBT_ACCEPT_HOST_API_PORT || 18000}`;
      return createApiClient(base);
    },
    async browser(stack) {
      const handle =
        (stack && stacks[stack]) || stacks.capella || stacks.product;
      const env = handle?.env || capellaEnv?.env || productEnv?.env;
      const origin =
        handle?.appOrigin ||
        `http://localhost:${env?.CBT_ACCEPT_HOST_APP_PORT || 18080}`;
      if (browserSession && ctx.shared.appOrigin === origin) {
        return browserSession;
      }
      if (browserSession) {
        await browserSession.close().catch(() => {});
        browserSession = null;
      }
      ctx.shared.appOrigin = origin;
      browserSession = await openBrowserSession({
        origin,
        evidenceDir,
      });
      return browserSession;
    },
    log,
  };

  /** @type {import('./lib/report.mjs').CheckResult[]} */
  const results = [];

  const resources = dockerResources();
  const environment = {
    os: `${process.platform} ${process.arch}`,
    ...resources,
    node: process.version,
    couchbaseImage: productEnv?.env.COUCHBASE_IMAGE || process.env.COUCHBASE_IMAGE || 'unknown',
  };

  try {
    for (const stage of STAGES) {
      const stageIds = stage.ids.filter(id => selected.has(id));
      // Capella stage skipped entirely without --capella
      if (stage.stack === 'capella' && !flags.capella) continue;
      if (stageIds.length === 0 && stage.name !== '5-aio') continue;

      log(`Stage ${stage.name}: ${stageIds.join(', ') || '(setup only)'}`);

      if (stage.stack === 'product') {
        if (!dockerAvailable()) {
          const err = new Error('Docker is not running or compose is missing');
          /** @type {any} */ (err).runnerError = true;
          throw err;
        }
        productEnv = prepareProductEnv(ROOT);
        environment.couchbaseImage = productEnv.env.COUCHBASE_IMAGE;
        // Point capture + dns into evidence via observe compose env
        writeFileSync(
          join(evidenceDir, 'statements.ndjson'),
          '',
        );
        const up = await upProductStack(ROOT, {
          envFile: productEnv.envFile,
          keepStack: flags.keepStack,
          reuseStack: flags.reuseStack,
          evidenceDir,
          log,
        });
        // Use localhost (not 127.0.0.1): express-session cookies are scoped to
        // Domain=localhost via FRONTEND_URL, so Playwright must share that host.
        stacks.product = {
          ...up,
          ready: up.ok,
          envFile: productEnv.envFile,
          env: productEnv.env,
          apiOrigin: `http://localhost:${productEnv.env.CBT_ACCEPT_HOST_API_PORT || 18000}`,
          appOrigin: `http://localhost:${productEnv.env.CBT_ACCEPT_HOST_APP_PORT || 18080}`,
          otlpEndpoint: `http://127.0.0.1:14318`,
          webhookPort: 18080,
        };
        ctx.shared.appOrigin = stacks.product.appOrigin;
      }

      if (stage.stack === 'perf') {
        // Reuse product stack as perf stand-in when a separate dev stack is not up.
        stacks.dev = stacks.product;
      }

      if (stage.stack === 'capella') {
        if (!dockerAvailable()) {
          const err = new Error('Docker is not running or compose is missing');
          /** @type {any} */ (err).runnerError = true;
          throw err;
        }
        // Capella overrides the local Couchbase service; tear down the product
        // stack first so ports/volumes do not collide.
        if (stacks.product && !flags.keepStack) {
          log('Tearing down product stack before Capella override');
          downProductStack(ROOT, {
            envFile: stacks.product.envFile,
            keepStack: false,
          });
          productEnv?.cleanup?.();
          stacks.product = null;
          productEnv = null;
        }
        if (browserSession) {
          await browserSession.close().catch(() => {});
          browserSession = null;
        }
        capellaEnv = prepareCapellaEnv(ROOT);
        if (capellaEnv.missing.length) {
          log(
            `Capella env missing: ${capellaEnv.missing.join(', ')} (checks will block)`,
          );
        } else {
          const up = await upCapellaStack(ROOT, {
            envFile: capellaEnv.envFile,
            keepStack: flags.keepStack,
            reuseStack: flags.reuseStack,
            evidenceDir,
            log,
          });
          stacks.capella = {
            ...up,
            ready: up.ok,
            envFile: capellaEnv.envFile,
            env: capellaEnv.env,
            apiOrigin: `http://localhost:${capellaEnv.env.CBT_ACCEPT_HOST_API_PORT || 18000}`,
            appOrigin: `http://localhost:${capellaEnv.env.CBT_ACCEPT_HOST_APP_PORT || 18080}`,
            otlpEndpoint: `http://127.0.0.1:14318`,
          };
          ctx.shared.appOrigin = stacks.capella.appOrigin;
        }
      }

      for (const id of stageIds) {
        const check = BY_ID.get(id);
        if (!check) continue;
        log(`Running ${id} ${check.title}`);
        let res;
        try {
          res = await check.run(ctx);
        } catch (err) {
          res = {
            id,
            title: check.title,
            status: 'fail',
            summary: err instanceof Error ? err.message : String(err),
            details: { stack: err instanceof Error ? err.stack : null },
            evidence: [],
            durationMs: 0,
          };
        }
        results.push(res);
        log(`${id} → ${res.status}: ${res.summary}`);
      }

      if (stage.stack === 'product' && !flags.keepStack) {
        // Tear down after stage 2 dependents; keep until after G1 in same stage.
        // Stage ends here — tear down unless keep/reuse for later stages that need it.
        // F1 may need a stack: if keepStack false, F1 uses whatever remains.
      }
    }

    // Tear down stacks at end unless keep-stack
    if (stacks.capella && !flags.keepStack) {
      log('Tearing down Capella stack');
      downCapellaStack(ROOT, {
        envFile: stacks.capella.envFile,
        keepStack: false,
      });
      capellaEnv?.cleanup?.();
    }
    if (stacks.product && !flags.keepStack) {
      log('Tearing down product stack');
      downProductStack(ROOT, {
        envFile: stacks.product.envFile,
        keepStack: false,
      });
      productEnv?.cleanup?.();
    }
  } catch (err) {
    if (browserSession) await browserSession.close().catch(() => {});
    if (stacks.capella && !flags.keepStack) {
      downCapellaStack(ROOT, { envFile: stacks.capella.envFile });
      capellaEnv?.cleanup?.();
    }
    if (productEnv && !flags.keepStack) {
      downProductStack(ROOT, { envFile: productEnv.envFile });
      productEnv.cleanup?.();
    }
    console.error('[acceptance] runner error:', err);
    process.exit(/** @type {any} */ (err).runnerError ? 3 : 3);
  }

  if (browserSession) await browserSession.close().catch(() => {});

  // Capella checks appear as blocked in full runs without --capella
  if (!flags.capella && !filtered && !reuseForRecordCi) {
    for (const id of ['C1', 'C2']) {
      if (!results.find(r => r.id === id)) {
        results.push({
          id,
          title: BY_ID.get(id)?.title || id,
          status: 'blocked',
          summary: 'Capella checks require --capella',
          details: null,
          evidence: [],
          durationMs: 0,
          request:
            'Provide a Capella 8.x cluster prepared per docs/capella.md and set the CBT_ACCEPT_CAPELLA_* variables, then run with --capella.',
        });
      }
    }
  }

  // Merge reused checks from the committed report (everything except K2).
  if (reuseForRecordCi) {
    for (const prior of priorReport.checks) {
      if (prior.id === 'K2') continue;
      if (!results.find(r => r.id === prior.id)) {
        results.push(prior);
      }
    }
  }

  // Ensure every selected / reported check has a result (order of CHECK_ORDER)
  const byId = new Map(results.map(r => [r.id, r]));
  const reportIds = CHECK_ORDER.filter(id => {
    if (reuseForRecordCi) return true;
    return selected.has(id) || (!filtered && (id === 'C1' || id === 'C2'));
  });
  const ordered = reportIds.map(
    id =>
      byId.get(id) || {
        id,
        title: BY_ID.get(id)?.title || id,
        status: 'skipped',
        summary: 'Not run',
        details: null,
        evidence: [],
        durationMs: 0,
      },
  );

  const final =
    !filtered && !flags.reuseStack && ordered.every(r => r.status !== 'skipped');

  const report = buildReport({
    checks: ordered.sort(
      (a, b) => CHECK_ORDER.indexOf(a.id) - CHECK_ORDER.indexOf(b.id),
    ),
    final,
    environment,
    root: ROOT,
  });

  // Filtered runs never produce a passing final report
  if (filtered) report.final = false;

  writeReportArtifacts(ROOT, report);
  productEnv?.cleanup?.();
  capellaEnv?.cleanup?.();

  const status = computeReportStatus(report.checks);
  log(`Report status=${status} final=${report.final}`);
  log(`Wrote port/state/acceptance/report.json and docs/acceptance.md`);

  if (report.checks.some(c => c.status === 'fail')) process.exit(1);
  if (report.checks.some(c => c.status === 'blocked')) process.exit(2);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(3);
});
