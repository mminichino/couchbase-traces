import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { result } from '../lib/report.mjs';

/** @typedef {import('../lib/report.mjs').CheckResult} CheckResult */

/**
 * @param {import('../run.mjs').RunContext} ctx
 * @returns {Promise<CheckResult>}
 */
async function b1(ctx) {
  const started = Date.now();
  if (!ctx.stacks?.product) {
    return result({
      id: 'B1',
      title: 'Fresh product stack',
      status: 'fail',
      summary: 'Product stack was not started',
      durationMs: Date.now() - started,
    });
  }
  const { ok, logs, ps } = ctx.stacks.product;
  const evidence = [
    join(ctx.evidenceDir, 'compose-ps.txt'),
    join(ctx.evidenceDir, 'couchbase-init.log'),
  ];
  if (!ok) {
    return result({
      id: 'B1',
      title: 'Fresh product stack',
      status: 'fail',
      summary: 'Stack did not become healthy within 600s',
      details: { ps, logsTail: String(logs).slice(-4000) },
      evidence,
      durationMs: Date.now() - started,
    });
  }
  return result({
    id: 'B1',
    title: 'Fresh product stack',
    status: 'pass',
    summary: 'Product stack healthy (couchbase-init, app, ingest, otel-collector)',
    details: { ps: String(ps).slice(0, 2000) },
    evidence,
    durationMs: Date.now() - started,
  });
}

/**
 * @param {import('../run.mjs').RunContext} ctx
 * @returns {Promise<CheckResult>}
 */
async function b2(ctx) {
  const started = Date.now();
  if (!ctx.stacks?.product?.ready) {
    return result({
      id: 'B2',
      title: 'Sample data views',
      status: 'fail',
      summary: 'Product stack not ready',
      durationMs: Date.now() - started,
    });
  }

  const views = JSON.parse(
    readFileSync(join(ctx.root, 'port/acceptance/views.json'), 'utf8'),
  );
  const evidence = [];
  /** @type {object[]} */
  const outcomes = [];

  try {
    const api = ctx.api('product');
    const session = await api.ensureSession();
    if (!session.ok) {
      return result({
        id: 'B2',
        title: 'Sample data views',
        status: 'fail',
        summary: `Could not register/login: ${session.error}`,
        durationMs: Date.now() - started,
      });
    }

    // Load sample data via documented ingest CLI when possible.
    const sample = spawnSync(
      'yarn',
      [
        'workspace',
        '@couchbase-traces/ingest',
        'sample-data',
        '--hours',
        '2',
        ...(session.apiKey ? ['--api-key', session.apiKey] : []),
      ],
      {
        cwd: ctx.root,
        encoding: 'utf8',
        env: {
          ...process.env,
          OTEL_EXPORTER_OTLP_ENDPOINT: ctx.stacks.product.otlpEndpoint,
        },
        timeout: 300_000,
      },
    );
    writeFileSync(
      join(ctx.evidenceDir, 'b2-sample-data.log'),
      `${sample.stdout}\n${sample.stderr}`,
    );
    evidence.push(join(ctx.evidenceDir, 'b2-sample-data.log'));

    const browser = await ctx.browser();
    for (const view of views) {
      try {
        await browser.goto(view.route, view.id);
        if (view.setup) await browser.applySetup(view.setup);
        const assertion = await browser.evaluateAssert(view.assert);
        const shot = await browser.screenshot(`b2-${view.id}`);
        evidence.push(shot);
        outcomes.push({
          id: view.id,
          ok: assertion.ok,
          actual: assertion.actual,
        });
      } catch (err) {
        outcomes.push({
          id: view.id,
          ok: false,
          actual: err instanceof Error ? err.message : String(err),
        });
      }
    }

    ctx.shared = ctx.shared || {};
    ctx.shared.pageTexts = [
      ...(ctx.shared.pageTexts || []),
      ...browser.pageTexts,
    ];
    ctx.shared.browserRequests = [
      ...(ctx.shared.browserRequests || []),
      ...browser.requests,
    ];

    const failed = outcomes.filter(o => !o.ok);
    if (failed.length) {
      return result({
        id: 'B2',
        title: 'Sample data views',
        status: 'fail',
        summary: `${failed.length}/${outcomes.length} views missing data`,
        details: { outcomes },
        evidence,
        durationMs: Date.now() - started,
      });
    }
    return result({
      id: 'B2',
      title: 'Sample data views',
      status: 'pass',
      summary: `All ${outcomes.length} primary views show data`,
      details: { outcomes },
      evidence,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    return result({
      id: 'B2',
      title: 'Sample data views',
      status: 'fail',
      summary: err instanceof Error ? err.message : String(err),
      details: { stack: err instanceof Error ? err.stack : null, outcomes },
      evidence,
      durationMs: Date.now() - started,
    });
  }
}

export const checks = [
  {
    id: 'B1',
    title: 'Fresh product stack',
    needs: ['product_stack'],
    run: b1,
  },
  {
    id: 'B2',
    title: 'Sample data views',
    needs: ['product_stack'],
    run: b2,
  },
];
