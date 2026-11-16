import { join } from 'node:path';

import { distinctStatements, readCaptureFile } from '../lib/capture.mjs';
import {
  collectScanOperators,
  evaluateExplainPlan,
} from '../lib/explain.mjs';
import { result } from '../lib/report.mjs';

/**
 * @param {import('../run.mjs').RunContext} ctx
 */
async function d1(ctx) {
  const started = Date.now();
  const capturePath =
    ctx.shared?.capturePath ||
    join(ctx.evidenceDir, 'statements.ndjson');
  const rows = distinctStatements(readCaptureFile(capturePath));
  if (rows.length === 0) {
    return result({
      id: 'D1',
      title: 'Index use',
      status: 'fail',
      summary: 'No captured statements from B2/G1; cannot verify index use',
      details: { capturePath },
      evidence: [capturePath],
      durationMs: Date.now() - started,
    });
  }

  /** @type {object[]} */
  const failing = [];
  /** @type {object[]} */
  const passing = [];
  /** @type {object[]} */
  const exempt = [];

  const api = ctx.stacks?.product?.ready ? ctx.api('product') : null;
  if (api) {
    const prior = ctx.shared?.session;
    const session = await api.ensureSession(
      prior ? { email: prior.email, password: prior.password } : {},
    );
    if (!session.ok) {
      return result({
        id: 'D1',
        title: 'Index use',
        status: 'fail',
        summary: `Auth failed for EXPLAIN: ${session.error}`,
        details: { capturePath },
        evidence: [capturePath],
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
  }

  for (const row of rows) {
    const verdict = evaluateExplainPlan(row.statement, null);
    // Exempt without EXPLAIN
    if (
      evaluateExplainPlan(row.statement, { '#operator': 'Sequence' }) ===
        'exempt' ||
      /\bsystem\s*:/i.test(row.statement) ||
      /^\s*INFER\b/i.test(row.statement) ||
      /^\s*EXPLAIN\b/i.test(row.statement)
    ) {
      exempt.push({ statement: row.statement.slice(0, 200) });
      continue;
    }

    if (!api) {
      failing.push({
        statement: row.statement.slice(0, 200),
        reason: 'no API client to run EXPLAIN',
      });
      continue;
    }

    try {
      const explainStmt = /^\s*EXPLAIN\b/i.test(row.statement)
        ? row.statement
        : `EXPLAIN ${row.statement}`;
      const res = await api.couchbaseQuery({
        connectionId: row.connectionId,
        statement: explainStmt,
        parameters: row.parameters ?? undefined,
        queryContext: row.queryContext ?? undefined,
      });
      // NDJSON or JSON body. EXPLAIN rows are `{ plan, text }`.
      let plan = null;
      const unwrap = row =>
        row?.plan ??
        row?.['~plan'] ??
        (row?.['#operator'] ? row : null);
      if (res.json?.plan) plan = res.json.plan;
      else if (Array.isArray(res.json)) plan = unwrap(res.json[0]) ?? res.json;
      else if (typeof res.text === 'string' && res.text.includes('{')) {
        const lines = res.text
          .split('\n')
          .filter(Boolean)
          .map(l => {
            try {
              return JSON.parse(l);
            } catch {
              return null;
            }
          })
          .filter(Boolean);
        const rowsFrame = lines.find(f => f.type === 'rows');
        const first = rowsFrame?.rows?.[0] ?? lines[0];
        plan = unwrap(first) ?? first;
      }
      if (!res.ok && plan == null) {
        failing.push({
          statement: row.statement.slice(0, 300),
          reason: `EXPLAIN HTTP ${res.status}: ${(res.text || '').slice(0, 200)}`,
        });
        continue;
      }
      const outcome = evaluateExplainPlan(row.statement, plan);
      const scans = collectScanOperators(plan);
      if (outcome === 'fail') {
        failing.push({
          statement: row.statement.slice(0, 300),
          scans: scans.scans,
          primary: scans.primary,
        });
      } else if (outcome === 'exempt') {
        exempt.push({ statement: row.statement.slice(0, 200) });
      } else {
        passing.push({
          statement: row.statement.slice(0, 200),
          scans: scans.scans,
        });
      }
    } catch (err) {
      failing.push({
        statement: row.statement.slice(0, 200),
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (failing.length) {
    return result({
      id: 'D1',
      title: 'Index use',
      status: 'fail',
      summary: `${failing.length} statement(s) use primary scan or failed EXPLAIN`,
      details: { failing, passing: passing.length, exempt: exempt.length },
      evidence: [capturePath],
      durationMs: Date.now() - started,
    });
  }
  return result({
    id: 'D1',
    title: 'Index use',
    status: 'pass',
    summary: `${passing.length} statements use indexes/key lookups (${exempt.length} exempt)`,
    details: { passing: passing.length, exempt: exempt.length },
    evidence: [capturePath],
    durationMs: Date.now() - started,
  });
}

export const checks = [
  {
    id: 'D1',
    title: 'Index use',
    needs: ['product_stack'],
    run: d1,
  },
];
