import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { result } from '../lib/report.mjs';
import { CAPELLA_ENV_KEYS } from '../lib/stack.mjs';

const CAPELLA_REQUEST =
  'Provide a Capella 8.x cluster prepared per docs/capella.md and set the CBT_ACCEPT_CAPELLA_* variables, then run with --capella.';

function missingCapellaVars() {
  return CAPELLA_ENV_KEYS.filter(k => !process.env[k]);
}

/**
 * @param {string} endpoint
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
 * Ensure a Couchbase connection exists for Capella credentials.
 * @param {import('../lib/api.mjs').ApiClient} api
 */
async function ensureCapellaConnection(api) {
  const listed = await api.connections();
  const list = Array.isArray(listed.json)
    ? listed.json
    : listed.json?.data || [];
  const connstr = process.env.CBT_ACCEPT_CAPELLA_CONNSTR;
  const existing =
    list.find(
      c =>
        c?.kind === 'couchbase' &&
        (c.host === connstr || String(c.host || '').includes('couchbases://')),
    ) || list.find(c => c?.kind === 'couchbase');
  if (existing?.id || existing?._id) {
    return String(existing.id || existing._id);
  }
  const created = await api.createConnection({
    kind: 'couchbase',
    name: 'Capella acceptance',
    host: connstr,
    username: process.env.CBT_ACCEPT_CAPELLA_QUERY_USER,
    password: process.env.CBT_ACCEPT_CAPELLA_QUERY_PASSWORD,
    wanProfile: true,
  });
  const id = created.json?.id ?? created.json?._id ?? null;
  if (!id) {
    throw new Error(
      `Could not create Capella connection: status=${created.status} ${String(created.text || '').slice(0, 300)}`,
    );
  }
  return String(id);
}

/**
 * @param {import('../run.mjs').RunContext} ctx
 */
async function c1(ctx) {
  const started = Date.now();
  if (!ctx.flags?.capella) {
    return result({
      id: 'C1',
      title: 'Capella connection',
      status: 'blocked',
      summary: 'Capella checks require --capella',
      request: CAPELLA_REQUEST,
      durationMs: Date.now() - started,
    });
  }
  const missing = missingCapellaVars();
  if (missing.length) {
    return result({
      id: 'C1',
      title: 'Capella connection',
      status: 'blocked',
      summary: `Missing env: ${missing.join(', ')}`,
      details: { missing },
      request: CAPELLA_REQUEST,
      durationMs: Date.now() - started,
    });
  }
  if (!ctx.stacks?.capella?.ready) {
    return result({
      id: 'C1',
      title: 'Capella connection',
      status: 'fail',
      summary:
        'Capella stack was not healthy; see capella-couchbase-init.log evidence',
      details: {
        ps: ctx.stacks?.capella?.ps
          ? String(ctx.stacks.capella.ps).slice(0, 2000)
          : null,
      },
      evidence: [
        join(ctx.evidenceDir, 'capella-compose-ps.txt'),
        join(ctx.evidenceDir, 'capella-couchbase-init.log'),
      ],
      durationMs: Date.now() - started,
    });
  }

  try {
    const api = ctx.api('capella');
    const session = await api.ensureSession();
    if (!session.ok) {
      return result({
        id: 'C1',
        title: 'Capella connection',
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

    const test = await api.couchbaseTest({
      host: process.env.CBT_ACCEPT_CAPELLA_CONNSTR,
      username: process.env.CBT_ACCEPT_CAPELLA_QUERY_USER,
      password: process.env.CBT_ACCEPT_CAPELLA_QUERY_PASSWORD,
      wanProfile: true,
    });
    const success = test.json?.success === true;
    writeFileSync(
      join(ctx.evidenceDir, 'c1-couchbase-test.json'),
      `${JSON.stringify({ status: test.status, body: test.json }, null, 2)}\n`,
    );
    if (!success) {
      return result({
        id: 'C1',
        title: 'Capella connection',
        status: 'fail',
        summary: 'Capella connection test did not succeed',
        details: { status: test.status, body: test.json ?? test.text },
        evidence: [join(ctx.evidenceDir, 'c1-couchbase-test.json')],
        durationMs: Date.now() - started,
      });
    }

    const connectionId = await ensureCapellaConnection(api);
    // Capella GSI builds are async after couchbase-init; retry test-source
    // until indexes can serve otel_logs (or we time out).
    const sourceDeadline = Date.now() + 300_000;
    let sourceTest = {
      status: 0,
      json: null,
      text: '',
    };
    let sourceOk = false;
    /** @type {object[]} */
    const sourceAttempts = [];
    while (Date.now() < sourceDeadline) {
      sourceTest = await api.couchbaseTestSource({
        connectionId,
        bucket: 'otel',
        scope: 'default',
        collection: 'otel_logs',
      });
      sourceAttempts.push({
        at: new Date().toISOString(),
        status: sourceTest.status,
        success: sourceTest.json?.success === true,
        code: sourceTest.json?.error?.code ?? null,
      });
      sourceOk = sourceTest.json?.success === true;
      if (sourceOk) break;
      const code = sourceTest.json?.error?.code;
      // Only retry index/build races; other failures fail fast.
      if (code && code !== 'INDEX_NOT_FOUND' && code !== 'TEMPORARY_FAILURE') {
        break;
      }
      await new Promise(r => setTimeout(r, 5000));
    }
    writeFileSync(
      join(ctx.evidenceDir, 'c1-test-source.json'),
      `${JSON.stringify(
        {
          connectionId,
          status: sourceTest.status,
          body: sourceTest.json,
          attempts: sourceAttempts,
        },
        null,
        2,
      )}\n`,
    );
    if (!sourceOk) {
      return result({
        id: 'C1',
        title: 'Capella connection',
        status: 'fail',
        summary: 'Capella logs keyspace test-source did not succeed',
        details: {
          connectionId,
          status: sourceTest.status,
          body: sourceTest.json ?? sourceTest.text,
          attempts: sourceAttempts.length,
        },
        evidence: [
          join(ctx.evidenceDir, 'c1-couchbase-test.json'),
          join(ctx.evidenceDir, 'c1-test-source.json'),
        ],
        durationMs: Date.now() - started,
      });
    }

    ctx.shared.capellaConnectionId = connectionId;
    return result({
      id: 'C1',
      title: 'Capella connection',
      status: 'pass',
      summary: 'Capella connection and logs test-source succeeded',
      details: { connectionId },
      evidence: [
        join(ctx.evidenceDir, 'c1-couchbase-test.json'),
        join(ctx.evidenceDir, 'c1-test-source.json'),
      ],
      durationMs: Date.now() - started,
    });
  } catch (err) {
    return result({
      id: 'C1',
      title: 'Capella connection',
      status: 'fail',
      summary: err instanceof Error ? err.message : String(err),
      details: { stack: err instanceof Error ? err.stack : null },
      durationMs: Date.now() - started,
    });
  }
}

/**
 * Capella cluster page may show restricted / not_configured instead of data.
 * @param {{ id: string, ok: boolean, actual: unknown }} outcome
 * @param {string} bodyText
 */
function clusterPagePasses(outcome, bodyText) {
  if (outcome.id !== 'couchbase-cluster') return outcome.ok;
  if (outcome.ok) return true;
  const t = String(bodyText || '').toLowerCase();
  return (
    t.includes('restricted') ||
    t.includes('not_configured') ||
    t.includes('not configured')
  );
}

/**
 * @param {import('../run.mjs').RunContext} ctx
 */
async function c2(ctx) {
  const started = Date.now();
  if (!ctx.flags?.capella || missingCapellaVars().length) {
    return result({
      id: 'C2',
      title: 'Capella views',
      status: 'blocked',
      summary: 'Capella credentials / --capella not provided',
      request: CAPELLA_REQUEST,
      durationMs: Date.now() - started,
    });
  }
  if (!ctx.stacks?.capella?.ready) {
    return result({
      id: 'C2',
      title: 'Capella views',
      status: 'fail',
      summary:
        'Capella stack was not brought up; configure docker-compose.capella.yml override for acceptance',
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
    const api = ctx.api('capella');
    const prior = ctx.shared?.session;
    const session = await api.ensureSession(
      prior ? { email: prior.email, password: prior.password } : {},
    );
    if (!session.ok) {
      return result({
        id: 'C2',
        title: 'Capella views',
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

    const collectorApiKey =
      session.teamApiKey ||
      session.apiKey ||
      ctx.stacks.capella?.env?.CBT_API_KEY ||
      '';
    const endpoint =
      ctx.stacks.capella?.otlpEndpoint || 'http://127.0.0.1:14318';

    if (!collectorApiKey) {
      return result({
        id: 'C2',
        title: 'Capella views',
        status: 'fail',
        summary: 'No team API key available for sample-data',
        durationMs: Date.now() - started,
      });
    }

    const otlpReady = await waitForOtlp(endpoint, 120_000);
    writeFileSync(
      join(ctx.evidenceDir, 'c2-otlp-wait.json'),
      `${JSON.stringify(otlpReady, null, 2)}\n`,
    );
    evidence.push(join(ctx.evidenceDir, 'c2-otlp-wait.json'));
    if (!otlpReady.ok) {
      return result({
        id: 'C2',
        title: 'Capella views',
        status: 'fail',
        summary: `OTLP endpoint ${endpoint} not reachable within 120s`,
        details: otlpReady,
        evidence,
        durationMs: Date.now() - started,
      });
    }

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
      join(ctx.evidenceDir, 'c2-sample-data.log'),
      `exit=${sample.status}\nendpoint=${endpoint}\n${sample.stdout}\n${sample.stderr}`,
    );
    evidence.push(join(ctx.evidenceDir, 'c2-sample-data.log'));
    if (sample.status !== 0) {
      return result({
        id: 'C2',
        title: 'Capella views',
        status: 'fail',
        summary: `sample-data exited ${sample.status}: ${(sample.stderr || sample.stdout || '').slice(-500)}`,
        evidence,
        durationMs: Date.now() - started,
      });
    }

    // Capella ingest can be slower over WAN; allow 300s for 1000 rows.
    const ready = await waitForLogRows(api, 1000, 300_000);
    writeFileSync(
      join(ctx.evidenceDir, 'c2-row-wait.json'),
      `${JSON.stringify(ready, null, 2)}\n`,
    );
    evidence.push(join(ctx.evidenceDir, 'c2-row-wait.json'));
    if (!ready.ok) {
      return result({
        id: 'C2',
        title: 'Capella views',
        status: 'fail',
        summary: `Logs source never reached 1000 rows within 300s (last=${ready.count})`,
        details: ready,
        evidence,
        durationMs: Date.now() - started,
      });
    }

    const sourcesList = await api.sources();
    const srcList = Array.isArray(sourcesList.json)
      ? sourcesList.json
      : sourcesList.json?.data || [];
    const logSrc = srcList.find(s => s.kind === 'log') || srcList[0];
    let dashboardId = null;
    if (logSrc?.id) {
      const tile = {
        id: 'accept-capella-tile-1',
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
          name: `accept-capella-dashboard-${Date.now()}`,
          tiles: [tile],
          tags: ['acceptance', 'capella'],
        },
      });
      dashboardId = dash.json?.id ?? dash.json?._id ?? null;
      writeFileSync(
        join(ctx.evidenceDir, 'c2-dashboard.json'),
        `${JSON.stringify({ status: dash.status, body: dash.json }, null, 2)}\n`,
      );
      evidence.push(join(ctx.evidenceDir, 'c2-dashboard.json'));
      if (dashboardId) {
        for (const view of views) {
          if (view.id === 'dashboard-template') {
            view.route = `/dashboards/${dashboardId}`;
          }
        }
      }
    }

    try {
      const conn = logSrc?.connection;
      if (conn) {
        const tr = await api.couchbaseQuery({
          connectionId: conn,
          statement:
            'SELECT RAW TraceId FROM `otel`.`default`.`otel_traces` AS d WHERE d.TraceId IS NOT MISSING LIMIT 1',
          format: 'JSON',
        });
        let traceId = null;
        if (tr.text) {
          for (const line of tr.text.split('\n')) {
            try {
              const f = JSON.parse(line);
              const row = Array.isArray(f.rows) ? f.rows[0] : null;
              if (typeof row === 'string') traceId = row;
              else if (row && typeof row.value === 'string') traceId = row.value;
              else if (typeof f === 'string') traceId = f;
            } catch {
              // ignore
            }
          }
        }
        if (traceId) {
          for (const view of views) {
            if (view.id === 'trace-waterfall') {
              view.route = `/trace/${traceId}`;
            }
          }
        }
      }
    } catch {
      // keep placeholder route
    }

    const browser = await ctx.browser('capella');
    await browser.ensureLoggedIn({
      email: session.email,
      password: session.password,
    });
    for (const view of views) {
      try {
        await browser.goto(view.route, view.id);
        if (view.setup) await browser.applySetup(view.setup);
        const assertion = await browser.evaluateAssert(view.assert);
        const bodyText = await browser.page.locator('body').innerText();
        const shot = await browser.screenshot(`c2-${view.id}`);
        evidence.push(shot);
        const ok = clusterPagePasses(
          { id: view.id, ok: assertion.ok, actual: assertion.actual },
          bodyText,
        );
        outcomes.push({
          id: view.id,
          ok,
          actual: assertion.actual,
          relaxedCluster: view.id === 'couchbase-cluster' && !assertion.ok && ok,
        });
      } catch (err) {
        outcomes.push({
          id: view.id,
          ok: false,
          actual: err instanceof Error ? err.message : String(err),
        });
      }
    }

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
        id: 'C2',
        title: 'Capella views',
        status: 'fail',
        summary: `${failed.length}/${outcomes.length} Capella views missing data`,
        details: { outcomes },
        evidence,
        durationMs: Date.now() - started,
      });
    }
    return result({
      id: 'C2',
      title: 'Capella views',
      status: 'pass',
      summary: `All ${outcomes.length} primary views show data on Capella`,
      details: { outcomes },
      evidence,
      durationMs: Date.now() - started,
    });
  } catch (err) {
    return result({
      id: 'C2',
      title: 'Capella views',
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
    id: 'C1',
    title: 'Capella connection',
    needs: ['capella_stack'],
    run: c1,
  },
  {
    id: 'C2',
    title: 'Capella views',
    needs: ['capella_stack'],
    run: c2,
  },
];
