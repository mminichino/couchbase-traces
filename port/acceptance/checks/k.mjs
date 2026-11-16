import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { result } from '../lib/report.mjs';

const K2_REQUEST =
  'Push this commit to origin (ORIGIN_URL) and run the acceptance runner with --record-ci <workflow run URL>.';

/**
 * Extract make/yarn run commands from a workflow YAML (heuristic).
 * @param {string} text
 * @returns {string[]}
 */
/**
 * Expand GitHub Actions ${{ }} expressions enough to run locally.
 * @param {string} cmd
 */
export function expandGithubExpressions(cmd) {
  let out = cmd
    .replace(/\$\{\{\s*matrix\.shard\s*\}\}/g, '1')
    .replace(/\$\{\{\s*strategy\.job-total\s*\}\}/g, '4')
    .replace(/\$\{\{\s*matrix\.[^}]+\}\}/g, '1')
    .replace(/\$\{\{\s*github\.[^}]+\}\}/g, 'local')
    .replace(/\$\{\{\s*env\.[^}]+\}\}/g, '')
    .replace(/\$\{\{\s*inputs\.[^}]+\}\}/g, '')
    .replace(/\$\{\{\s*[^}]+\}\}/g, '');
  // CI shards e2e across matrix workers; locally run the same suite via make.
  if (/^yarn\s+test:e2e\b/.test(out) && /--shard=/.test(out)) {
    out = 'make e2e';
  }
  return out;
}

export function extractLocalCiCommands(text) {
  /** @type {string[]} */
  const cmds = [];
  const lines = text.split(/\r?\n/);
  let inRun = false;
  let buf = [];
  for (const line of lines) {
    if (/^\s+run:\s*\|/.test(line) || /^\s+run:\s*>/.test(line)) {
      inRun = true;
      buf = [];
      continue;
    }
    if (/^\s+run:\s+\S/.test(line)) {
      const cmd = expandGithubExpressions(line.replace(/^\s+run:\s+/, '').trim());
      if (/^(make|yarn)\b/.test(cmd)) cmds.push(cmd);
      inRun = false;
      continue;
    }
    if (inRun) {
      if (/^\s{4,}\S/.test(line) || /^\s{2}-/.test(line) === false && /^\S/.test(line)) {
        if (/^\s{0,3}\S/.test(line) && !/^\s{4,}/.test(line)) {
          // end of block
          const block = buf.join('\n');
          for (const part of block.split(/\n/)) {
            const t = part.trim();
            if (/^(make|yarn)\b/.test(t)) cmds.push(expandGithubExpressions(t));
          }
          inRun = false;
          buf = [];
          // fallthrough to process this line normally if needed
        } else {
          buf.push(line.replace(/^\s+/, ''));
          continue;
        }
      } else {
        buf.push(line.replace(/^\s+/, ''));
        continue;
      }
    }
  }
  if (inRun && buf.length) {
    for (const part of buf) {
      const t = expandGithubExpressions(part.trim());
      if (/^(make|yarn)\b/.test(t)) cmds.push(t);
    }
  }
  return [...new Set(cmds)];
}

/**
 * @param {import('../run.mjs').RunContext} ctx
 */
async function k1(ctx) {
  const started = Date.now();
  const dir = join(ctx.root, '.github/workflows');
  const files = readdirSync(dir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  /** @type {object[]} */
  const steps = [];
  /** @type {string[]} */
  const commands = [];

  for (const f of files) {
    const text = readFileSync(join(dir, f), 'utf8');
    if (!/on:\s*[\s\S]*?(pull_request|push)/.test(text) && !/\bpull_request\b|\bpush\b/.test(text)) {
      continue;
    }
    for (const cmd of extractLocalCiCommands(text)) {
      commands.push(cmd);
      steps.push({ file: f, cmd });
    }
  }

  /** @type {object[]} */
  const results = [];
  let failed = false;
  // Deduplicate while preserving order
  const seen = new Set();
  for (const cmd of commands) {
    if (seen.has(cmd)) continue;
    seen.add(cmd);
    ctx.log(`K1: ${cmd}`);
    const r = spawnSync('bash', ['-lc', cmd], {
      cwd: ctx.root,
      encoding: 'utf8',
      timeout: 600_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    results.push({
      cmd,
      status: r.status,
      out: (r.stdout || '').slice(-1500),
      err: (r.stderr || '').slice(-1500),
    });
    if (r.status !== 0) failed = true;
  }

  // docker-build.yml builds then smokes couchbase-traces-aio-smoke:pr.
  const smoke = join(ctx.root, 'scripts/ci/smoke-all-in-one.sh');
  if (existsSync(smoke)) {
    const smokeTag = 'couchbase-traces-aio-smoke:pr';
    const buildCmd = [
      'docker',
      'build',
      '.',
      '-f',
      './docker/hyperdx/Dockerfile',
      '--build-context',
      'otel-collector=./docker/otel-collector',
      '--build-context',
      'hyperdx=./docker/hyperdx',
      '--build-context',
      'api=./packages/api',
      '--build-context',
      'app=./packages/app',
      '--build-arg',
      'CODE_VERSION=acceptance-local',
      '--build-arg',
      'COUCHBASE_IMAGE=couchbase/server:enterprise-8.0.3',
      '-t',
      smokeTag,
      '--target',
      'all-in-one-auth',
    ];
    ctx.log(`K1: ${buildCmd.join(' ')}`);
    const build = spawnSync(buildCmd[0], buildCmd.slice(1), {
      cwd: ctx.root,
      encoding: 'utf8',
      timeout: 1_800_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    results.push({
      cmd: buildCmd.join(' '),
      status: build.status,
      out: (build.stdout || '').slice(-1500),
      err: (build.stderr || '').slice(-1500),
    });
    if (build.status !== 0) failed = true;
    else {
      const smokeCmd = `scripts/ci/smoke-all-in-one.sh ${smokeTag}`;
      ctx.log(`K1: ${smokeCmd}`);
      const r = spawnSync('bash', [smoke, smokeTag], {
        cwd: ctx.root,
        encoding: 'utf8',
        timeout: 600_000,
        maxBuffer: 20 * 1024 * 1024,
      });
      results.push({
        cmd: smokeCmd,
        status: r.status,
        out: (r.stdout || '').slice(-1500),
        err: (r.stderr || '').slice(-1500),
      });
      if (r.status !== 0) failed = true;
    }
  }

  return result({
    id: 'K1',
    title: 'Local CI',
    status: failed ? 'fail' : 'pass',
    summary: failed
      ? 'One or more local CI commands failed'
      : `All ${results.length} local CI commands passed`,
    details: { steps, results },
    durationMs: Date.now() - started,
  });
}

/**
 * @param {import('../run.mjs').RunContext} ctx
 */
async function k2(ctx) {
  const started = Date.now();
  const url = ctx.flags?.recordCi;
  if (!url) {
    return result({
      id: 'K2',
      title: 'GitHub Actions',
      status: 'blocked',
      summary: 'Pending push and --record-ci',
      request: K2_REQUEST,
      durationMs: Date.now() - started,
    });
  }
  try {
    const m = String(url).match(
      /github\.com\/([^/]+)\/([^/]+)\/actions\/runs\/(\d+)/,
    );
    if (!m) {
      return result({
        id: 'K2',
        title: 'GitHub Actions',
        status: 'fail',
        summary: 'Could not parse workflow run URL',
        details: { url },
        durationMs: Date.now() - started,
      });
    }
    const [, owner, repo, runId] = m;
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'couchbase-traces-acceptance',
    };
    if (process.env.GITHUB_TOKEN) {
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    }
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}`,
      { headers },
    );
    if (res.status === 403) {
      const reset = res.headers.get('x-ratelimit-reset');
      return result({
        id: 'K2',
        title: 'GitHub Actions',
        status: 'blocked',
        summary: 'GitHub API rate limited',
        request: `GitHub API rate limited; retry after ${reset ? new Date(Number(reset) * 1000).toISOString() : 'the rate limit reset'}.`,
        durationMs: Date.now() - started,
      });
    }
    const body = await res.json();
    const sha = ctx.reportGitSha || body.head_sha;
    const ok =
      body.conclusion === 'success' &&
      (!ctx.reportGitSha || body.head_sha === ctx.reportGitSha);
    return result({
      id: 'K2',
      title: 'GitHub Actions',
      status: ok ? 'pass' : 'fail',
      summary: ok
        ? 'GitHub Actions run succeeded for this SHA'
        : `Run conclusion=${body.conclusion} sha=${body.head_sha}`,
      details: {
        conclusion: body.conclusion,
        head_sha: body.head_sha,
        expectedSha: ctx.reportGitSha,
        html_url: body.html_url,
      },
      durationMs: Date.now() - started,
    });
  } catch (err) {
    return result({
      id: 'K2',
      title: 'GitHub Actions',
      status: 'fail',
      summary: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - started,
    });
  }
}

export const checks = [
  { id: 'K1', title: 'Local CI', needs: ['all_in_one'], run: k1 },
  { id: 'K2', title: 'GitHub Actions', needs: ['static'], run: k2 },
];
