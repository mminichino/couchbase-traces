import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { findOutboundRequests } from '../lib/browser.mjs';
import { evaluateDnsQueries, parseCoreDnsLog } from '../lib/dns.mjs';
import { result } from '../lib/report.mjs';

/**
 * @param {import('../run.mjs').RunContext} ctx
 */
async function i1(ctx) {
  const started = Date.now();
  const requests = ctx.shared?.browserRequests ?? [];
  const origin =
    ctx.stacks?.product?.appOrigin ||
    ctx.shared?.appOrigin ||
    'http://localhost:18080';
  if (!requests.length) {
    return result({
      id: 'I1',
      title: 'Outbound browser',
      status: 'fail',
      summary: 'No browser requests recorded during view runs',
      durationMs: Date.now() - started,
    });
  }
  const bad = findOutboundRequests(requests, origin);
  if (bad.length) {
    return result({
      id: 'I1',
      title: 'Outbound browser',
      status: 'fail',
      summary: `${bad.length} request(s) left the app origin`,
      details: { bad: bad.slice(0, 50), origin },
      durationMs: Date.now() - started,
    });
  }
  return result({
    id: 'I1',
    title: 'Outbound browser',
    status: 'pass',
    summary: `All ${requests.length} browser requests stayed on origin`,
    details: { origin, count: requests.length },
    durationMs: Date.now() - started,
  });
}

/**
 * @param {import('../run.mjs').RunContext} ctx
 */
async function i2(ctx) {
  const started = Date.now();
  const logPath =
    ctx.shared?.dnsLogPath ||
    join(ctx.evidenceDir, 'coredns', 'query.log');
  const allowlist = JSON.parse(
    readFileSync(join(ctx.root, 'port/acceptance/dns-allowlist.json'), 'utf8'),
  );
  // Prefer file log; otherwise dump CoreDNS container stdout into evidence.
  if (!existsSync(logPath) || readFileSync(logPath, 'utf8').trim() === '') {
    const { spawnSync } = await import('node:child_process');
    const { PROJECT_NAME } = await import('../lib/stack.mjs');
    const { mkdirSync, writeFileSync } = await import('node:fs');
    mkdirSync(join(ctx.evidenceDir, 'coredns'), { recursive: true });
    const logs = spawnSync(
      'docker',
      ['compose', '-p', PROJECT_NAME, 'logs', 'dns'],
      { cwd: ctx.root, encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 },
    );
    writeFileSync(logPath, `${logs.stdout || ''}\n${logs.stderr || ''}`);
  }
  if (!existsSync(logPath)) {
    return result({
      id: 'I2',
      title: 'Outbound server DNS',
      status: 'fail',
      summary: `CoreDNS query log not found at ${logPath}`,
      details: { logPath },
      durationMs: Date.now() - started,
    });
  }
  const names = parseCoreDnsLog(readFileSync(logPath, 'utf8'));
  const composeServices = [
    'db',
    'couchbase',
    'couchbase-init',
    'ingest',
    'otel-collector',
    'app',
    'dns',
    'webhook',
  ];
  const evaled = evaluateDnsQueries(names, allowlist, composeServices);
  if (!evaled.ok) {
    return result({
      id: 'I2',
      title: 'Outbound server DNS',
      status: 'fail',
      summary: `Blocked=${evaled.blocked.length} unexpected=${evaled.unexpected.length} DNS queries`,
      details: evaled,
      evidence: [logPath],
      durationMs: Date.now() - started,
    });
  }
  return result({
    id: 'I2',
    title: 'Outbound server DNS',
    status: 'pass',
    summary: `All ${names.length} DNS queries allowed`,
    details: { count: names.length },
    evidence: [logPath],
    durationMs: Date.now() - started,
  });
}

export const checks = [
  { id: 'I1', title: 'Outbound browser', needs: ['product_stack'], run: i1 },
  { id: 'I2', title: 'Outbound server DNS', needs: ['product_stack'], run: i2 },
];
