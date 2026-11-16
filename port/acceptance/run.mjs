#!/usr/bin/env node
/**
 * Phase 11 acceptance runner.
 *
 * node port/acceptance/run.mjs [--only ids] [--skip ids] [--capella]
 *   [--keep-stack] [--reuse-stack] [--record-ci <url>]
 *
 * Exit: 0 all passed; 1 any failed; 2 any blocked and none failed; 3 runner error.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
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
  downProductStack,
  prepareProductEnv,
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

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    console.log(`Usage: node port/acceptance/run.mjs [--only ids] [--skip ids] [--capella] [--keep-stack] [--reuse-stack] [--record-ci url]`);
    process.exit(0);
  }

  const selected = new Set(selectIds(flags));
  const filtered = Boolean(flags.only || flags.skip);
  const evidenceDir = join(ROOT, 'port/state/acceptance/evidence');
  mkdirSync(evidenceDir, { recursive: true });
  mkdirSync(join(evidenceDir, 'coredns'), { recursive: true });

  /** @type {any} */
  let browserSession = null;
  /** @type {ReturnType<typeof prepareProductEnv>|null} */
  let productEnv = null;

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
    shared: {
      capturePath: join(evidenceDir, 'statements.ndjson'),
      dnsLogPath: join(evidenceDir, 'coredns', 'query.log'),
      pageTexts: [],
      browserRequests: [],
    },
    testResults: null,
    api(stack) {
      const handle = stacks[stack] || stacks.product;
      const base =
        handle?.apiOrigin ||
        `http://127.0.0.1:${productEnv?.env.CBT_ACCEPT_HOST_API_PORT || 18000}`;
      return createApiClient(base);
    },
    async browser() {
      if (browserSession) return browserSession;
      const origin =
        stacks.product?.appOrigin ||
        `http://127.0.0.1:${productEnv?.env.CBT_ACCEPT_HOST_APP_PORT || 18080}`;
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
        stacks.product = {
          ...up,
          ready: up.ok,
          envFile: productEnv.envFile,
          env: productEnv.env,
          apiOrigin: `http://127.0.0.1:${productEnv.env.CBT_ACCEPT_HOST_API_PORT || 18000}`,
          appOrigin: `http://127.0.0.1:${productEnv.env.CBT_ACCEPT_HOST_APP_PORT || 18080}`,
          otlpEndpoint: `http://127.0.0.1:14318`,
          webhookPort: 18080,
        };
        ctx.shared.appOrigin = stacks.product.appOrigin;
      }

      if (stage.stack === 'perf') {
        // Reuse product stack as perf stand-in when a separate dev stack is not up.
        stacks.dev = stacks.product;
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

    // Tear down product stack at end unless keep-stack
    if (stacks.product && !flags.keepStack) {
      log('Tearing down product stack');
      downProductStack(ROOT, {
        envFile: stacks.product.envFile,
        keepStack: false,
      });
    }
  } catch (err) {
    if (browserSession) await browserSession.close().catch(() => {});
    if (productEnv && !flags.keepStack) {
      downProductStack(ROOT, { envFile: productEnv.envFile });
      productEnv.cleanup?.();
    }
    console.error('[acceptance] runner error:', err);
    process.exit(/** @type {any} */ (err).runnerError ? 3 : 3);
  }

  if (browserSession) await browserSession.close().catch(() => {});

  // Capella checks appear as blocked in full runs without --capella
  if (!flags.capella && !filtered) {
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

  // Ensure every selected / reported check has a result (order of CHECK_ORDER)
  const byId = new Map(results.map(r => [r.id, r]));
  const reportIds = CHECK_ORDER.filter(
    id => selected.has(id) || (!filtered && (id === 'C1' || id === 'C2')),
  );
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
