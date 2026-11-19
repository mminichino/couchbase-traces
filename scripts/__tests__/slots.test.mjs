import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const SLOTS = path.join(REPO, 'scripts', 'slots.sh');
const WITH_SLOTS = path.join(REPO, 'scripts', 'with-slots.sh');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hdx-slots-'));
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

/** A throwaway git worktree whose folder name picks the slot. */
function worktree(name) {
  const dir = path.join(tmp, name);
  fs.mkdirSync(path.join(dir, 'packages', 'api'), { recursive: true });
  execFileSync('git', ['init', '-q', dir]);
  return dir;
}

// No inherited HDX_* variables, so a developer's shell can't leak into results.
const cleanEnv = (extra = {}) => ({
  PATH: process.env.PATH,
  HOME: path.join(tmp, 'home'),
  ...extra,
});

const pick = output =>
  Object.fromEntries(
    output
      .trim()
      .split('\n')
      .filter(line => /^(HDX_|CBT_|E2E_PROJECT=)/.test(line))
      .map(line => line.split('=')),
  );

/** Variables exported by `. slots.sh && <fn> [dir]`, run from `cwd`. */
function ports(fn, { cwd, dir, env } = {}) {
  const script = `. "$0" && ${fn} ${dir == null ? '' : '"$1"'} && env`;
  return pick(
    execFileSync('sh', ['-c', script, SLOTS, ...(dir == null ? [] : [dir])], {
      cwd,
      env: cleanEnv(env),
      encoding: 'utf8',
    }),
  );
}

const hyperdxEe = worktree('hyperdx-ee');

test('exports the dev stack ports', () => {
  assert.deepEqual(ports('hdx_dev_ports', { cwd: hyperdxEe }), {
    CBT_DEV_SLOT: '44',
    CBT_API_PORT: '30144',
    CBT_APP_PORT: '30244',
    CBT_OPAMP_PORT: '30344',
    CBT_DEV_CH_HTTP_PORT: '30544',
    CBT_DEV_CH_NATIVE_PORT: '30644',
    CBT_DEV_OTEL_HEALTH_PORT: '30744',
    CBT_DEV_OTEL_GRPC_PORT: '30844',
    CBT_DEV_OTEL_HTTP_PORT: '30944',
    CBT_DEV_OTEL_METRICS_PORT: '31044',
    CBT_DEV_OTEL_JSON_HTTP_PORT: '31144',
    CBT_DEV_INGEST_PORT: '31244',
    CBT_DEV_CB_MGMT_PORT: '18135',
    CBT_DEV_CB_PORT_8092: '18136',
    CBT_DEV_CB_PORT_8093: '18137',
    CBT_DEV_CB_PORT_8094: '18138',
    CBT_DEV_CB_PORT_8095: '18139',
    CBT_DEV_CB_PORT_8096: '18140',
    CBT_DEV_CB_PORT_8097: '18141',
    CBT_DEV_CB_KV_PORT: '19054',
    CBT_DEV_PROJECT: 'hdx-dev-44',
  });
});

test('exports the integration test ports', () => {
  assert.deepEqual(ports('hdx_ci_ports', { cwd: hyperdxEe }), {
    CBT_CI_SLOT: '44',
    CBT_CI_CH_PORT: '18167',
    CBT_CI_API_PORT: '19044',
    CBT_CI_OPAMP_PORT: '14364',
    CBT_CI_PROJECT: 'int-44',
  });
});

test('exports the E2E test ports', () => {
  assert.deepEqual(ports('hdx_e2e_ports', { cwd: hyperdxEe }), {
    CBT_E2E_SLOT: '44',
    CBT_E2E_OPAMP_PORT: '20364',
    CBT_E2E_CH_PORT: '20544',
    CBT_E2E_CH_NATIVE_PORT: '20644',
    CBT_E2E_API_PORT: '21044',
    CBT_E2E_APP_LOCAL_PORT: '21244',
    CBT_E2E_APP_PORT: '21344',
    CBT_E2E_REPORT_PORT: '9367',
    CBT_E2E_CB_MGMT_PORT: '28135',
    CBT_E2E_CB_VIEW_PORT: '28235',
    CBT_E2E_CB_QUERY_PORT: '28335',
    CBT_E2E_CB_FTS_PORT: '28435',
    CBT_E2E_CB_ANALYTICS_PORT: '28535',
    CBT_E2E_CB_EVENTING_PORT: '28635',
    CBT_E2E_CB_BACKUP_PORT: '28735',
    CBT_E2E_CB_KV_PORT: '28835',
    E2E_PROJECT: 'e2e-44',
  });
});

test('derives the slot from the worktree folder name', () => {
  const hyperdx = worktree('hyperdx');
  assert.equal(ports('hdx_dev_ports', { cwd: hyperdx }).CBT_DEV_SLOT, '96');
});

test('gives the same slot from a subdirectory or a directory argument', () => {
  const subdir = path.join(hyperdxEe, 'packages', 'api');
  assert.equal(ports('hdx_dev_ports', { cwd: subdir }).CBT_DEV_SLOT, '44');
  assert.equal(
    ports('hdx_dev_ports', { cwd: tmp, dir: subdir }).CBT_DEV_SLOT,
    '44',
  );
});

test('CBT_SLOT_FROM=path gives same-named worktrees their own slots', () => {
  const slotOf = s =>
    Number(
      execFileSync('cksum', { input: s, encoding: 'utf8' }).split(' ')[0],
    ) % 100;
  for (const name of ['a/hyperdx', 'b/hyperdx']) {
    const dir = worktree(name);
    const subdir = path.join(dir, 'packages', 'api');
    const env = { CBT_SLOT_FROM: 'path' };
    assert.equal(ports('hdx_dev_ports', { cwd: dir }).CBT_DEV_SLOT, '96');
    assert.equal(
      ports('hdx_dev_ports', { cwd: subdir, env }).CBT_DEV_SLOT,
      String(slotOf(fs.realpathSync(dir))),
    );
  }
});

test('warns about an unknown CBT_SLOT_FROM and uses the folder name', () => {
  const result = spawnSync(
    'sh',
    ['-c', '. "$0" && hdx_dev_ports && printf %s "$CBT_DEV_SLOT"', SLOTS],
    {
      cwd: hyperdxEe,
      env: cleanEnv({ CBT_SLOT_FROM: 'paths' }),
      encoding: 'utf8',
    },
  );
  assert.equal(result.stdout, '44');
  assert.match(result.stderr, /CBT_SLOT_FROM must be 'name' or 'path'/);
});

test('overrides each slot independently', () => {
  const env = { CBT_DEV_SLOT: '5', CBT_E2E_SLOT: '7' };
  const dev = ports('hdx_dev_ports', { cwd: hyperdxEe, env });
  assert.equal(dev.CBT_API_PORT, '30105');
  assert.equal(dev.CBT_DEV_PROJECT, 'hdx-dev-5');
  assert.equal(
    ports('hdx_e2e_ports', { cwd: hyperdxEe, env }).E2E_PROJECT,
    'e2e-7',
  );
  assert.equal(
    ports('hdx_ci_ports', { cwd: hyperdxEe, env }).CBT_CI_SLOT,
    '44',
  );
});

test('keeps E2E ports that are already set, as CI pins them', () => {
  const e2e = ports('hdx_e2e_ports', {
    cwd: hyperdxEe,
    env: { CBT_E2E_API_PORT: '21000' },
  });
  assert.equal(e2e.CBT_E2E_API_PORT, '21000');
  assert.equal(e2e.CBT_E2E_APP_PORT, '21344');
});

test('writes, deletes, and prints nothing', () => {
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  const snapshot = () =>
    [home, hyperdxEe].map(dir => fs.readdirSync(dir, { recursive: true }));
  const before = snapshot();
  const output = execFileSync(
    'sh',
    ['-c', '. "$0" && hdx_dev_ports && hdx_ci_ports && hdx_e2e_ports', SLOTS],
    { cwd: hyperdxEe, env: cleanEnv(), encoding: 'utf8', stdio: 'pipe' },
  );
  assert.equal(output, '');
  assert.deepEqual(snapshot(), before);
});

test('with-slots.sh runs a command with the dev ports of its own worktree', () => {
  const expected = ports('hdx_dev_ports', { cwd: REPO });
  // Run from outside the repo: the slot must come from the script's location.
  const output = execFileSync(WITH_SLOTS, ['env'], {
    cwd: tmp,
    env: cleanEnv(),
    encoding: 'utf8',
  });
  const actual = pick(output);
  assert.equal(actual.CBT_DEV_CH_HTTP_PORT, expected.CBT_DEV_CH_HTTP_PORT);
  assert.equal(actual.CBT_DEV_SLOT, expected.CBT_DEV_SLOT);
});

test('no other code derives a slot', () => {
  // The slot formula is `cksum` of the folder name; slots.sh must be the only
  // copy so the dev stack, tests, and tools can never disagree. Any tracked use
  // of the word fails this; if a file needs `cksum` for something else,
  // exclude it below.
  const files = execFileSync(
    'git',
    [
      'grep',
      '-lw',
      'cksum',
      '--',
      '*.sh',
      '*.js',
      '*.mjs',
      '*.ts',
      'Makefile',
      '*.yml',
      ':!scripts/__tests__/slots.test.mjs',
      ':!port/lib/baseline.sh',
    ],
    { cwd: REPO, encoding: 'utf8' },
  )
    .trim()
    .split('\n');
  assert.deepEqual(files, ['scripts/slots.sh']);
});
