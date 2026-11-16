import { result } from '../lib/report.mjs';

const CAPELLA_REQUEST =
  'Provide a Capella 8.x cluster prepared per docs/capella.md and set the CBT_ACCEPT_CAPELLA_* variables, then run with --capella.';

const REQUIRED = [
  'CBT_ACCEPT_CAPELLA_CONNSTR',
  'CBT_ACCEPT_CAPELLA_ADMIN_USER',
  'CBT_ACCEPT_CAPELLA_ADMIN_PASSWORD',
  'CBT_ACCEPT_CAPELLA_QUERY_USER',
  'CBT_ACCEPT_CAPELLA_QUERY_PASSWORD',
  'CBT_ACCEPT_CAPELLA_INGEST_USER',
  'CBT_ACCEPT_CAPELLA_INGEST_PASSWORD',
];

function missingCapellaVars() {
  return REQUIRED.filter(k => !process.env[k]);
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
  try {
    const api = ctx.api('capella') || ctx.api('product');
    await api.ensureSession();
    const test = await api.couchbaseTest({
      host: process.env.CBT_ACCEPT_CAPELLA_CONNSTR,
      username: process.env.CBT_ACCEPT_CAPELLA_QUERY_USER,
      password: process.env.CBT_ACCEPT_CAPELLA_QUERY_PASSWORD,
      wanProfile: true,
    });
    const success =
      test.json?.success === true || test.json?.ok === true || test.ok;
    if (!success) {
      return result({
        id: 'C1',
        title: 'Capella connection',
        status: 'fail',
        summary: 'Capella connection test did not succeed',
        details: { status: test.status, body: test.json ?? test.text },
        durationMs: Date.now() - started,
      });
    }
    return result({
      id: 'C1',
      title: 'Capella connection',
      status: 'pass',
      summary: 'Capella connection test succeeded',
      details: { body: test.json },
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
  // Capella view run mirrors B2 against the Capella stack; without a dedicated
  // Capella stack handle, report fail with actionable summary rather than fake pass.
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
  return result({
    id: 'C2',
    title: 'Capella views',
    status: 'fail',
    summary:
      'C2 Capella view assertions are wired but Capella stack population was not completed in this run',
    durationMs: Date.now() - started,
  });
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
