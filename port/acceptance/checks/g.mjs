import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { result } from '../lib/report.mjs';
import {
  chooseControlThreshold,
  chooseThreshold,
} from '../lib/threshold.mjs';
import { PROJECT_NAME } from '../lib/stack.mjs';

const SOURCES = ['saved_search', 'tile', 'inline'];
const THRESHOLDS = [
  'above',
  'below',
  'above_exclusive',
  'below_or_equal',
  'equal',
  'not_equal',
  'between',
  'not_between',
];

/** Slack requires a slack.com hostname; CoreDNS aliases it to the receiver. */
const WEBHOOK_URLS = {
  generic: 'http://webhook:8080/generic',
  slack: 'http://hooks.slack.com:8080/slack',
  incidentio: 'http://api.incident.io:8080/incidentio',
};

const WEBHOOK_SERVICES = Object.keys(WEBHOOK_URLS);

/**
 * @param {import('../run.mjs').RunContext} ctx
 */
async function g1(ctx) {
  const started = Date.now();
  if (!ctx.stacks?.product?.ready) {
    return result({
      id: 'G1',
      title: 'Alerts',
      status: 'fail',
      summary: 'Product stack not ready',
      durationMs: Date.now() - started,
    });
  }

  const api = ctx.api('product');
  const prior = ctx.shared?.session;
  const session = await api.ensureSession(
    prior ? { email: prior.email, password: prior.password } : {},
  );
  if (!session.ok) {
    return result({
      id: 'G1',
      title: 'Alerts',
      status: 'fail',
      summary: `Auth failed: ${session.error}`,
      durationMs: Date.now() - started,
    });
  }
  ctx.shared = ctx.shared || {};
  ctx.shared.session = {
    email: session.email,
    password: session.password,
    apiKey: session.apiKey,
    teamApiKey: session.teamApiKey ?? session.apiKey,
  };

  /** @type {object[]} */
  const problems = [];

  const webhooks = [];
  for (const service of WEBHOOK_SERVICES) {
    const res = await api.request('/webhooks', {
      method: 'POST',
      json: {
        name: `accept-${service}`,
        service,
        url: WEBHOOK_URLS[service],
      },
    });
    const id =
      res.json?.data?._id ??
      res.json?.data?.id ??
      res.json?.id ??
      res.json?._id ??
      null;
    webhooks.push({
      service,
      id,
      status: res.status,
      body: res.json,
      text: res.text?.slice?.(0, 500),
    });
    if (!id) {
      problems.push({
        step: 'create_webhook',
        service,
        status: res.status,
        body: res.json ?? res.text,
      });
    }
  }

  const sources = await api.sources();
  const list = Array.isArray(sources.json)
    ? sources.json
    : sources.json?.data || [];
  const logSource = list.find(s => s.kind === 'log') || list[0];
  const logSourceId = logSource?.id || logSource?._id;

  // Create a saved search used by saved_search alerts.
  let savedSearchId = null;
  if (logSourceId) {
    const ss = await api.request('/saved-searches', {
      method: 'POST',
      json: {
        name: 'accept-alert-search',
        query: '',
        sourceId: logSourceId,
      },
    });
    savedSearchId =
      ss.json?.data?.id ??
      ss.json?.data?._id ??
      ss.json?.id ??
      ss.json?._id ??
      null;
    if (!savedSearchId) {
      // Try alternate shape used by some builds.
      const ss2 = await api.request('/saved-searches', {
        method: 'POST',
        json: {
          name: 'accept-alert-search',
          filter: '',
          source: logSourceId,
        },
      });
      savedSearchId =
        ss2.json?.data?.id ??
        ss2.json?.data?._id ??
        ss2.json?.id ??
        ss2.json?._id ??
        null;
      if (!savedSearchId) {
        problems.push({
          step: 'create_saved_search',
          status: ss.status,
          body: ss.json ?? ss.text,
          alt: ss2.json ?? ss2.text,
        });
      }
    }
  } else {
    problems.push({ step: 'sources', error: 'no log source' });
  }

  /** @type {object[]} */
  const matrix = [];
  /** @type {object[]} */
  const createdAlerts = [];
  let wi = 0;

  for (const source of SOURCES) {
    for (const type of THRESHOLDS) {
      const measured = 10;
      const firing = chooseThreshold(type, measured);
      const control = chooseControlThreshold(type, measured);
      const webhook = webhooks[wi % webhooks.length];
      wi++;

      const base = {
        interval: '5m',
        thresholdType: type,
        channel: webhook.id
          ? { type: 'webhook', webhookId: String(webhook.id) }
          : undefined,
        name: `accept-${source}-${type}`,
      };

      const firingBody = buildAlertBody(source, {
        ...base,
        ...firing,
        savedSearchId,
        logSourceId,
      });
      const controlBody = buildAlertBody(source, {
        ...base,
        ...control,
        name: `accept-control-${source}-${type}`,
        savedSearchId,
        logSourceId,
      });

      const fireRes = firingBody
        ? await api.request('/alerts', { method: 'POST', json: firingBody })
        : { ok: false, status: 0, json: { error: 'unsupported source shape' } };
      const ctrlRes = controlBody
        ? await api.request('/alerts', { method: 'POST', json: controlBody })
        : { ok: false, status: 0, json: { error: 'unsupported source shape' } };

      const fireId =
        fireRes.json?.data?.id ??
        fireRes.json?.data?._id ??
        fireRes.json?.id ??
        null;
      const ctrlId =
        ctrlRes.json?.data?.id ??
        ctrlRes.json?.data?._id ??
        ctrlRes.json?.id ??
        null;

      if (!fireId) {
        problems.push({
          step: 'create_firing_alert',
          source,
          type,
          status: fireRes.status,
          body: fireRes.json ?? fireRes.text,
        });
      }
      if (!ctrlId) {
        problems.push({
          step: 'create_control_alert',
          source,
          type,
          status: ctrlRes.status,
          body: ctrlRes.json ?? ctrlRes.text,
        });
      }

      createdAlerts.push({ fireId, ctrlId, source, type, webhook: webhook.service });
      matrix.push({
        source,
        type,
        measured,
        firing,
        control,
        webhook: webhook.service,
        fireId,
        ctrlId,
        firingState: null,
        controlState: null,
        payloadSeen: false,
      });
    }
  }

  // One-shot check-alerts in the API container.
  const task = spawnSync(
    'docker',
    [
      'compose',
      '-p',
      PROJECT_NAME,
      'exec',
      '-T',
      '-e',
      'RUN_SCHEDULED_TASKS_EXTERNALLY=true',
      'app',
      './packages/api/bin/hyperdx',
      'task',
      'check-alerts',
    ],
    { cwd: ctx.root, encoding: 'utf8', timeout: 300_000 },
  );

  // Dump webhook payloads from the receiver.
  let payloads = [];
  const dump = spawnSync(
    'docker',
    [
      'compose',
      '-p',
      PROJECT_NAME,
      'exec',
      '-T',
      'webhook',
      'node',
      '-e',
      "fetch('http://127.0.0.1:8080/_dump').then(r=>r.text()).then(t=>console.log(t)).catch(e=>{console.error(e); process.exit(1)})",
    ],
    { cwd: ctx.root, encoding: 'utf8', timeout: 30_000 },
  );
  try {
    payloads = JSON.parse(dump.stdout || '[]');
  } catch {
    payloads = [];
  }

  // Refresh alert states.
  for (const row of matrix) {
    if (row.fireId) {
      const a = await api.request(`/alerts/${row.fireId}`);
      row.firingState = a.json?.data?.state ?? a.json?.state ?? a.json?.data?.status ?? null;
    }
    if (row.ctrlId) {
      const a = await api.request(`/alerts/${row.ctrlId}`);
      row.controlState = a.json?.data?.state ?? a.json?.state ?? a.json?.data?.status ?? null;
    }
    row.payloadSeen = payloads.some(
      p =>
        String(p.path || p.url || '').includes(row.webhook) ||
        String(p.body || '').includes(String(row.fireId || '')),
    );
  }

  writeFileSync(
    join(ctx.evidenceDir, 'g1-alerts.json'),
    `${JSON.stringify(
      {
        matrix,
        webhooks,
        createdAlerts,
        problems,
        payloads,
        task: {
          status: task.status,
          out: (task.stdout || '').slice(-4000),
          err: (task.stderr || '').slice(-4000),
        },
        dump: {
          status: dump.status,
          out: (dump.stdout || '').slice(0, 2000),
          err: (dump.stderr || '').slice(0, 1000),
        },
      },
      null,
      2,
    )}\n`,
  );

  const createdWebhooks = webhooks.filter(w => w.id).length;
  if (createdWebhooks < WEBHOOK_SERVICES.length) {
    return result({
      id: 'G1',
      title: 'Alerts',
      status: 'fail',
      summary: `Alert matrix incomplete (webhooks created=${createdWebhooks}/${WEBHOOK_SERVICES.length}); see evidence`,
      details: { matrix, webhooks, problems, payloadCount: payloads.length },
      evidence: [join(ctx.evidenceDir, 'g1-alerts.json')],
      durationMs: Date.now() - started,
    });
  }

  const fireOk = matrix.filter(
    r => r.fireId && (r.firingState === 'ALERT' || r.payloadSeen),
  ).length;
  const controlOk = matrix.filter(
    r => r.ctrlId && r.controlState && r.controlState !== 'ALERT',
  ).length;
  const expected = matrix.length;

  if (fireOk === expected && controlOk === expected) {
    return result({
      id: 'G1',
      title: 'Alerts',
      status: 'pass',
      summary: `All ${expected} source×threshold pairs fired with controls quiet`,
      details: { matrix, webhooks, payloadCount: payloads.length },
      evidence: [join(ctx.evidenceDir, 'g1-alerts.json')],
      durationMs: Date.now() - started,
    });
  }

  return result({
    id: 'G1',
    title: 'Alerts',
    status: 'fail',
    summary: `Alerts incomplete: firing=${fireOk}/${expected} control=${controlOk}/${expected} payloads=${payloads.length}; problems=${problems.length}`,
    details: {
      matrix,
      webhooks,
      problems: problems.slice(0, 40),
      payloadCount: payloads.length,
      taskStatus: task.status,
    },
    evidence: [join(ctx.evidenceDir, 'g1-alerts.json')],
    durationMs: Date.now() - started,
  });
}

/**
 * @param {string} source
 * @param {object} opts
 */
function buildAlertBody(source, opts) {
  const channel = opts.channel;
  if (!channel) return null;
  if (source === 'saved_search') {
    if (!opts.savedSearchId) return null;
    return {
      source: 'saved_search',
      savedSearchId: String(opts.savedSearchId),
      interval: opts.interval,
      threshold: opts.threshold,
      thresholdType: opts.thresholdType,
      thresholdMax: opts.thresholdMax,
      channel,
      name: opts.name,
    };
  }
  if (source === 'inline') {
    if (!opts.logSourceId) return null;
    return {
      source: 'inline',
      interval: opts.interval,
      threshold: opts.threshold,
      thresholdType: opts.thresholdType,
      thresholdMax: opts.thresholdMax,
      channel,
      name: opts.name,
      chartConfig: {
        name: opts.name,
        displayType: 'number',
        source: String(opts.logSourceId),
        select: [{ aggFn: 'count', valueExpression: '' }],
        where: '',
        whereLanguage: 'lucene',
      },
    };
  }
  // tile alerts need a dashboard tile id — create path not wired yet.
  if (source === 'tile') {
    return null;
  }
  return null;
}

export const checks = [
  {
    id: 'G1',
    title: 'Alerts',
    needs: ['product_stack'],
    run: g1,
  },
];
