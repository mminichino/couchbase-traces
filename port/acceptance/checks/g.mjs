import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { result } from '../lib/report.mjs';
import {
  chooseControlThreshold,
  chooseThreshold,
} from '../lib/threshold.mjs';

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
const WEBHOOK_SERVICES = ['generic', 'slack', 'incidentio'];

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
  await api.ensureSession();

  /** @type {object[]} */
  const matrix = [];
  /** @type {object[]} */
  const problems = [];

  // Create webhooks pointing at the observe receiver.
  const webhooks = [];
  for (let i = 0; i < WEBHOOK_SERVICES.length; i++) {
    const service = WEBHOOK_SERVICES[i];
    const res = await api.request('/webhooks', {
      method: 'POST',
      json: {
        name: `accept-${service}`,
        service,
        url: `http://webhook:8080/${service}`,
      },
    });
    webhooks.push({
      service,
      id: res.json?.id ?? res.json?._id ?? res.json?.data?.id,
      status: res.status,
      body: res.json,
    });
    if (!res.ok && res.status !== 200 && res.status !== 201) {
      problems.push({ step: 'create_webhook', service, status: res.status });
    }
  }

  // Build alert matrix — choose thresholds from a synthetic measured value when
  // live evaluation APIs are unavailable.
  let wi = 0;
  for (const source of SOURCES) {
    for (const type of THRESHOLDS) {
      const measured = 10;
      const firing = chooseThreshold(type, measured);
      const control = chooseControlThreshold(type, measured);
      const webhook = webhooks[wi % webhooks.length];
      wi++;
      matrix.push({
        source,
        type,
        measured,
        firing,
        control,
        webhook: webhook.service,
        // Outcomes filled after check-alerts; default to unknown.
        firingState: null,
        controlState: null,
        payloadSeen: false,
      });
    }
  }

  // Attempt to run check-alerts in the API container.
  const { spawnSync } = await import('node:child_process');
  const { PROJECT_NAME } = await import('../lib/stack.mjs');
  const task = spawnSync(
    'docker',
    [
      'compose',
      '-p',
      PROJECT_NAME,
      'exec',
      '-T',
      'app',
      'node',
      '-e',
      "console.log('check-alerts placeholder')",
    ],
    { cwd: ctx.root, encoding: 'utf8' },
  );

  // Read webhook receiver payloads.
  let payloads = [];
  try {
    const wh = await fetch(
      `http://127.0.0.1:${ctx.stacks.product.webhookPort || 18080}/_dump`,
    ).catch(() => null);
    // Prefer docker exec curl to the webhook service.
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
        "fetch('http://127.0.0.1:8080/_dump').then(r=>r.text()).then(t=>console.log(t))",
      ],
      { cwd: ctx.root, encoding: 'utf8' },
    );
    try {
      payloads = JSON.parse(dump.stdout || '[]');
    } catch {
      payloads = [];
    }
  } catch {
    payloads = [];
  }

  writeFileSync(
    join(ctx.evidenceDir, 'g1-alerts.json'),
    `${JSON.stringify({ matrix, webhooks, payloads, task: { status: task.status, out: task.stdout, err: task.stderr } }, null, 2)}\n`,
  );

  // Without a fully wired alert creation API sequence, do not fake pass.
  const created = webhooks.filter(w => w.id).length;
  if (created < WEBHOOK_SERVICES.length || problems.length) {
    return result({
      id: 'G1',
      title: 'Alerts',
      status: 'fail',
      summary: `Alert matrix incomplete (webhooks created=${created}/${WEBHOOK_SERVICES.length}); see evidence`,
      details: { matrix, webhooks, problems, payloadCount: payloads.length },
      evidence: [join(ctx.evidenceDir, 'g1-alerts.json')],
      durationMs: Date.now() - started,
    });
  }

  // If webhooks exist but we did not create/fire every alert, fail with matrix.
  return result({
    id: 'G1',
    title: 'Alerts',
    status: 'fail',
    summary:
      'Webhooks created; full source×threshold fire/control verification needs alert create + check-alerts wiring against this stack',
    details: {
      matrixSize: matrix.length,
      webhooks,
      payloadCount: payloads.length,
    },
    evidence: [join(ctx.evidenceDir, 'g1-alerts.json')],
    durationMs: Date.now() - started,
  });
}

export const checks = [
  {
    id: 'G1',
    title: 'Alerts',
    needs: ['product_stack'],
    run: g1,
  },
];
