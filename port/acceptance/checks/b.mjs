import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { result } from '../lib/report.mjs';

/** @typedef {import('../lib/report.mjs').CheckResult} CheckResult */

/**
 * @param {string} endpoint e.g. http://127.0.0.1:14318
 * @param {number} timeoutMs
 */
async function waitForOtlp(endpoint, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = { ok: false, status: 0, error: null };
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${endpoint.replace(/\/$/, '')}/v1/logs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
      last = { ok: true, status: res.status, error: null };
      // Any HTTP response means the port is accepting connections.
      return last;
    } catch (err) {
      last = {
        ok: false,
        status: 0,
        error: err instanceof Error ? err.message : String(err),
      };
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return last;
}

/**
 * Poll until the logs collection reports at least `min` documents.
 * @param {import('../lib/api.mjs').ApiClient} api
 * @param {number} min
 * @param {number} timeoutMs
 */
async function waitForLogRows(api, min, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let last = { ok: false, count: 0, error: null, connectionId: null };
  const sources = await api.sources();
  const list = Array.isArray(sources.json)
    ? sources.json
    : sources.json?.data || sources.json?.sources || [];
  const logSource =
    list.find(s => /log/i.test(s?.kind || '') || /log/i.test(s?.name || '')) ||
    list[0];
  const connectionId =
    logSource?.connection ??
    logSource?.connectionId ??
    logSource?.from?.connectionId ??
    null;
  const from = logSource?.from || {};
  const collection =
    from.databaseName && from.tableName
      ? `\`${from.databaseName}\`.\`${from.scopeName || 'default'}\`.\`${from.tableName}\``
      : '`otel`.`default`.`otel_logs`';
  last.connectionId = connectionId;
  if (!connectionId) {
    return { ...last, error: 'No connectionId from /sources' };
  }
  while (Date.now() < deadline) {
    try {
      // Prefer an indexed predicate so D1 does not see a primary scan from the harness.
      const res = await api.couchbaseQuery({
        connectionId,
        statement: `SELECT COUNT(*) AS c FROM ${collection} AS l WHERE l.Timestamp IS NOT MISSING`,
        format: 'JSON',
      });
      let count = 0;
      if (res.json?.rows?.[0]?.c != null) count = Number(res.json.rows[0].c);
      else if (Array.isArray(res.json) && res.json[0]?.c != null)
        count = Number(res.json[0].c);
      else if (res.text) {
        for (const line of res.text.split('\n')) {
          try {
            const row = JSON.parse(line);
            if (row.c != null) count = Number(row.c);
            if (row.rows?.[0]?.c != null) count = Number(row.rows[0].c);
          } catch {
            // ignore
          }
        }
      }
      last = { ok: count >= min, count, error: null, connectionId };
      if (last.ok) return last;
    } catch (err) {
      last = {
        ok: false,
        count: last.count,
        error: err instanceof Error ? err.message : String(err),
        connectionId,
      };
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  return last;
}

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
    const prior = ctx.shared?.session;
    const session = await api.ensureSession(
      prior ? { email: prior.email, password: prior.password } : {},
    );
    if (!session.ok) {
      return result({
        id: 'B2',
        title: 'Sample data views',
        status: 'fail',
        summary: `Could not register/login: ${session.error}`,
        durationMs: Date.now() - started,
      });
    }
    ctx.shared = ctx.shared || {};
    ctx.shared.session = {
      email: session.email,
      password: session.password,
      apiKey: session.apiKey,
      teamApiKey: session.teamApiKey ?? session.apiKey,
      accessKey: session.accessKey,
    };

    // Spec §6.5: use the team API key against the stack collector.
    const collectorApiKey =
      session.teamApiKey ||
      session.apiKey ||
      ctx.stacks.product?.env?.CBT_API_KEY ||
      process.env.CBT_API_KEY ||
      '';
    const endpoint =
      ctx.stacks.product?.otlpEndpoint || 'http://127.0.0.1:14318';

    if (!collectorApiKey) {
      return result({
        id: 'B2',
        title: 'Sample data views',
        status: 'fail',
        summary: 'No team API key available for sample-data',
        durationMs: Date.now() - started,
      });
    }

    // Collector health can race the published OTLP port; wait until HTTP
    // responds (any status including 401) before sample-data.
    const otlpReady = await waitForOtlp(endpoint, 120_000);
    writeFileSync(
      join(ctx.evidenceDir, 'b2-otlp-wait.json'),
      `${JSON.stringify(otlpReady, null, 2)}\n`,
    );
    evidence.push(join(ctx.evidenceDir, 'b2-otlp-wait.json'));
    if (!otlpReady.ok) {
      return result({
        id: 'B2',
        title: 'Sample data views',
        status: 'fail',
        summary: `OTLP endpoint ${endpoint} not reachable within 120s`,
        details: otlpReady,
        evidence,
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
        '--endpoint',
        endpoint,
        '--api-key',
        collectorApiKey,
      ],
      {
        cwd: ctx.root,
        encoding: 'utf8',
        env: {
          ...process.env,
          CBT_API_KEY: collectorApiKey,
        },
        timeout: 300_000,
      },
    );
    writeFileSync(
      join(ctx.evidenceDir, 'b2-sample-data.log'),
      `exit=${sample.status}\nendpoint=${endpoint}\n${sample.stdout}\n${sample.stderr}`,
    );
    evidence.push(join(ctx.evidenceDir, 'b2-sample-data.log'));
    if (sample.status !== 0) {
      return result({
        id: 'B2',
        title: 'Sample data views',
        status: 'fail',
        summary: `sample-data exited ${sample.status}: ${(sample.stderr || sample.stdout || '').slice(-500)}`,
        evidence,
        durationMs: Date.now() - started,
      });
    }

    // Wait until logs source has ≥1000 rows (up to 180s).
    const ready = await waitForLogRows(api, 1000, 180_000);
    writeFileSync(
      join(ctx.evidenceDir, 'b2-row-wait.json'),
      `${JSON.stringify(ready, null, 2)}\n`,
    );
    evidence.push(join(ctx.evidenceDir, 'b2-row-wait.json'));
    if (!ready.ok) {
      return result({
        id: 'B2',
        title: 'Sample data views',
        status: 'fail',
        summary: `Logs source never reached 1000 rows within 180s (last=${ready.count})`,
        details: ready,
        evidence,
        durationMs: Date.now() - started,
      });
    }

    // Create a dashboard with a tile so dashboard-template / tile alerts have a target.
    const sourcesList = await api.sources();
    const srcList = Array.isArray(sourcesList.json)
      ? sourcesList.json
      : sourcesList.json?.data || [];
    const logSrc = srcList.find(s => s.kind === 'log') || srcList[0];
    let dashboardId = null;
    let tileId = null;
    if (logSrc?.id) {
      const tile = {
        id: 'accept-tile-1',
        x: 0,
        y: 0,
        w: 6,
        h: 3,
        config: {
          name: 'accept count',
          displayType: 'line',
          source: String(logSrc.id),
          select: [{ aggFn: 'count', valueExpression: '' }],
          where: '',
          whereLanguage: 'lucene',
          granularity: 'auto',
        },
      };
      const dash = await api.request('/dashboards', {
        method: 'POST',
        json: {
          name: `accept-dashboard-${Date.now()}`,
          tiles: [tile],
          tags: ['acceptance'],
        },
      });
      dashboardId = dash.json?.id ?? dash.json?._id ?? null;
      tileId = dash.json?.tiles?.[0]?.id ?? tile.id;
      writeFileSync(
        join(ctx.evidenceDir, 'b2-dashboard.json'),
        `${JSON.stringify({ status: dash.status, body: dash.json }, null, 2)}\n`,
      );
      evidence.push(join(ctx.evidenceDir, 'b2-dashboard.json'));
      if (dashboardId) {
        // Point the dashboard-template view at the created dashboard.
        for (const view of views) {
          if (view.id === 'dashboard-template') {
            view.route = `/dashboards/${dashboardId}`;
          }
        }
        ctx.shared.dashboard = { id: dashboardId, tileId };
      }
    }

    const browser = await ctx.browser();
    await browser.ensureLoggedIn({
      email: session.email,
      password: session.password,
    });
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
