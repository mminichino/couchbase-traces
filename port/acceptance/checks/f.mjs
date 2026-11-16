import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { result } from '../lib/report.mjs';
import { dockerResources } from '../lib/stack.mjs';

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[idx];
}

/**
 * @param {import('../run.mjs').RunContext} ctx
 */
async function f1(ctx) {
  const started = Date.now();
  const resources = dockerResources();
  const minBytes = 8 * 1024 * 1024 * 1024;
  if (resources.dockerCpus < 4 || resources.dockerMemoryBytes < minBytes) {
    return result({
      id: 'F1',
      title: 'Search latency',
      status: 'blocked',
      summary: `Docker resources insufficient (cpus=${resources.dockerCpus}, mem=${resources.dockerMemoryBytes})`,
      details: resources,
      request:
        'Raise Docker Desktop resources to at least 4 CPUs and 8 GB of memory, then re-run acceptance.',
      durationMs: Date.now() - started,
    });
  }

  if (!ctx.stacks?.dev?.ready && !ctx.stacks?.product?.ready) {
    return result({
      id: 'F1',
      title: 'Search latency',
      status: 'fail',
      summary: 'Dev/product stack not ready for latency measurement',
      details: resources,
      durationMs: Date.now() - started,
    });
  }

  try {
    const browser = await ctx.browser();
    const shapes = [
      { id: 'no_query', setup: [] },
      {
        id: 'bare_word',
        setup: [
          {
            action: 'fill',
            selector: '[data-testid="search-input"]',
            value: 'error',
          },
        ],
      },
      {
        id: 'service_filter',
        setup: [
          {
            action: 'fill',
            selector: '[data-testid="search-input"]',
            value: 'ServiceName:api',
          },
        ],
      },
    ];

    /** @type {Record<string, number[]>} */
    const byShape = {};
    for (const shape of shapes) {
      byShape[shape.id] = [];
      // warm-up
      await browser.goto('/search', `f1-warmup-${shape.id}`);
      if (shape.setup.length) await browser.applySetup(shape.setup);
      try {
        await browser.page.locator('[data-testid="search-submit-button"]').click({
          timeout: 10_000,
        });
      } catch {
        // may already auto-search
      }
      await browser.page.waitForTimeout(2000);

      for (let i = 0; i < 10; i++) {
        const t0 = Date.now();
        let firstPageMs = null;
        const onResponse = async res => {
          const url = res.url();
          if (
            /\/chart|\/query|\/search|\/logs|\/multi/i.test(url) &&
            res.request().method() !== 'OPTIONS' &&
            firstPageMs == null
          ) {
            try {
              const timing = res.request().timing?.();
              firstPageMs =
                timing?.responseEnd ?? Date.now() - t0;
            } catch {
              firstPageMs = Date.now() - t0;
            }
          }
        };
        browser.page.on('response', onResponse);
        await browser.goto('/search', `f1-${shape.id}-${i}`);
        if (shape.setup.length) await browser.applySetup(shape.setup);
        try {
          await browser.page
            .locator('[data-testid="search-submit-button"]')
            .click({ timeout: 5_000 });
        } catch {
          // ignore
        }
        try {
          await browser.page
            .locator('[data-testid="search-results-table"] tbody tr')
            .first()
            .waitFor({ timeout: 30_000 });
        } catch {
          // row may be empty
        }
        browser.page.off('response', onResponse);
        const ms = firstPageMs ?? Date.now() - t0;
        byShape[shape.id].push(ms);
      }
    }

    /** @type {object[]} */
    const summary = [];
    let fail = false;
    for (const [id, samples] of Object.entries(byShape)) {
      const sorted = [...samples].sort((a, b) => a - b);
      const p50 = percentile(sorted, 50);
      const p95 = percentile(sorted, 95);
      summary.push({ id, p50, p95, samples });
      if (p95 == null || p95 >= 2000) fail = true;
    }

    writeFileSync(
      join(ctx.evidenceDir, 'f1-latency.json'),
      `${JSON.stringify({ resources, summary }, null, 2)}\n`,
    );

    if (fail) {
      return result({
        id: 'F1',
        title: 'Search latency',
        status: 'fail',
        summary: 'p95 first-page request exceeded 2000ms for one or more shapes',
        details: { resources, summary },
        evidence: [join(ctx.evidenceDir, 'f1-latency.json')],
        durationMs: Date.now() - started,
      });
    }
    return result({
      id: 'F1',
      title: 'Search latency',
      status: 'pass',
      summary: 'p95 first-page request under 2000ms for all query shapes',
      details: { resources, summary },
      evidence: [join(ctx.evidenceDir, 'f1-latency.json')],
      durationMs: Date.now() - started,
    });
  } catch (err) {
    return result({
      id: 'F1',
      title: 'Search latency',
      status: 'fail',
      summary: err instanceof Error ? err.message : String(err),
      details: { stack: err instanceof Error ? err.stack : null, resources },
      durationMs: Date.now() - started,
    });
  }
}

export const checks = [
  {
    id: 'F1',
    title: 'Search latency',
    needs: ['perf_stack'],
    run: f1,
  },
];
