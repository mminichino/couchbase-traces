import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { result } from '../lib/report.mjs';

const GITLEAKS_IMAGE = 'zricethezav/gitleaks:v8.21.2';

/**
 * @param {import('../run.mjs').RunContext} ctx
 */
async function l1(ctx) {
  const started = Date.now();
  const allowlist = join(ctx.root, 'port/acceptance/gitleaks-allowlist.toml');
  const reportPath = join(ctx.evidenceDir, 'gitleaks.json');

  // Ensure docker for gitleaks container
  const info = spawnSync('docker', ['info'], { encoding: 'utf8' });
  if (info.status !== 0) {
    return result({
      id: 'L1',
      title: 'Secrets',
      status: 'fail',
      summary: 'Docker required to run gitleaks container',
      details: { err: info.stderr.slice(0, 500) },
      durationMs: Date.now() - started,
    });
  }

  const r = spawnSync(
    'docker',
    [
      'run',
      '--rm',
      '-v',
      `${ctx.root}:/repo`,
      '-v',
      `${allowlist}:/allowlist.toml:ro`,
      GITLEAKS_IMAGE,
      'detect',
      '--source',
      '/repo',
      '--log-opts',
      '--all',
      '--config',
      '/allowlist.toml',
      '--report-path',
      '/repo/port/state/acceptance/evidence/gitleaks.json',
      '--report-format',
      'json',
      '--exit-code',
      '1',
      '--no-banner',
    ],
    {
      cwd: ctx.root,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  // gitleaks exit 0 = clean, 1 = leaks found
  if (r.status === 0) {
    return result({
      id: 'L1',
      title: 'Secrets',
      status: 'pass',
      summary: 'gitleaks found no secrets',
      evidence: [reportPath],
      durationMs: Date.now() - started,
    });
  }
  if (r.status === 1) {
    return result({
      id: 'L1',
      title: 'Secrets',
      status: 'fail',
      summary: 'gitleaks reported findings',
      details: {
        out: (r.stdout || '').slice(-3000),
        err: (r.stderr || '').slice(-3000),
      },
      evidence: [reportPath],
      durationMs: Date.now() - started,
    });
  }
  return result({
    id: 'L1',
    title: 'Secrets',
    status: 'fail',
    summary: `gitleaks exited ${r.status}`,
    details: {
      out: (r.stdout || '').slice(-2000),
      err: (r.stderr || '').slice(-2000),
    },
    durationMs: Date.now() - started,
  });
}

export const checks = [
  { id: 'L1', title: 'Secrets', needs: ['static'], run: l1 },
];
