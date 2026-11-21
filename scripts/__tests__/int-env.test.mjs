import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const INT_ENV = path.join(REPO, 'scripts', 'int-env.sh');

/** Runs `int-env.sh [keep...] -- env` and parses the child's environment. */
function run(env, keep = []) {
  const r = spawnSync('bash', [INT_ENV, ...keep, '--', 'env'], {
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env },
  });
  assert.equal(r.status, 0, r.stderr.toString());
  const vars = Object.fromEntries(
    r.stdout
      .toString()
      .trim()
      .split('\n')
      .map(line => [
        line.slice(0, line.indexOf('=')),
        line.slice(line.indexOf('=') + 1),
      ]),
  );
  return { vars, stderr: r.stderr.toString() };
}

test('leftover credentials and connection strings do not reach int tests', () => {
  const { vars, stderr } = run({
    CBT_COUCHBASE_ADMIN_PASSWORD: 'dev-admin-password',
    CBT_TEST_COUCHBASE_USER: 'someone',
    CBT_TEST_COUCHBASE_PASSWORD: 'secret-value',
    CBT_TEST_COUCHBASE_CONNSTR: 'couchbase://elsewhere',
    CBT_TEST_COUCHBASE_PORT_OFFSET: '20000',
    CBT_METADATA_CONNSTR: 'couchbase://dev-host',
    COUCHBASE_URL: 'http://elsewhere:8093',
    COUCHBASE_USERNAME: 'u',
    COUCHBASE_PASSWORD: 'p',
  });
  for (const name of [
    'CBT_COUCHBASE_ADMIN_PASSWORD',
    'CBT_TEST_COUCHBASE_USER',
    'CBT_TEST_COUCHBASE_PASSWORD',
    'CBT_TEST_COUCHBASE_CONNSTR',
    'CBT_TEST_COUCHBASE_PORT_OFFSET',
    'CBT_METADATA_CONNSTR',
    'COUCHBASE_URL',
    'COUCHBASE_USERNAME',
    'COUCHBASE_PASSWORD',
  ]) {
    assert.equal(vars[name], undefined, name);
  }
  assert.match(stderr, /int: ignoring inherited .*CBT_TEST_COUCHBASE_USER/);
  // Names only, never values.
  assert.doesNotMatch(stderr, /secret-value|dev-admin-password/);
});

test('keeps the CI slot, slot source, portal, and unrelated variables', () => {
  const { vars, stderr } = run({
    CBT_CI_SLOT: '5',
    CBT_CI_API_PORT: '30005',
    CBT_SLOT_FROM: 'path',
    CBT_PORTAL_PORT: '9901',
    OTEL_COLLECTOR_VERSION: '0.1',
  });
  assert.equal(vars.CBT_CI_SLOT, '5');
  assert.equal(vars.CBT_CI_API_PORT, '30005');
  assert.equal(vars.CBT_SLOT_FROM, 'path');
  assert.equal(vars.CBT_PORTAL_PORT, '9901');
  assert.equal(vars.OTEL_COLLECTOR_VERSION, '0.1');
  // Nothing was stripped, so the only notice is the live-suite skip.
  assert.doesNotMatch(stderr, /ignoring inherited/);
});

test('live-cluster suites skip on purpose, with a log line naming run.sh', () => {
  // A leftover `1` from a run.sh shell must not make ci-int fail on auth.
  const { vars, stderr } = run({ CBT_TEST_COUCHBASE_REQUIRED: '1' });
  assert.equal(vars.CBT_TEST_COUCHBASE_REQUIRED, '0');
  assert.match(
    stderr,
    /CBT_TEST_COUCHBASE_REQUIRED=0: live-cluster suites .* run in port\/couchbase-test\/run\.sh/,
  );
});

test('extra keep patterns are honored (run.sh port offset)', () => {
  const { vars } = run(
    { CBT_TEST_COUCHBASE_PORT_OFFSET: '21000', CBT_TEST_COUCHBASE_USER: 'x' },
    ['CBT_TEST_COUCHBASE_PORT_OFFSET'],
  );
  assert.equal(vars.CBT_TEST_COUCHBASE_PORT_OFFSET, '21000');
  assert.equal(vars.CBT_TEST_COUCHBASE_USER, undefined);
});

test('passes the command exit status through', () => {
  const r = spawnSync('bash', [INT_ENV, '--', 'bash', '-c', 'exit 7'], {
    env: { PATH: process.env.PATH },
  });
  assert.equal(r.status, 7);
});

test('the E2E isolation shares the same rules', () => {
  const r = spawnSync(
    'bash',
    [
      '-c',
      `. "${path.join(REPO, 'scripts', 'e2e-env.sh')}" && cbt_e2e_isolate_env && env`,
    ],
    {
      env: {
        PATH: process.env.PATH,
        CBT_CI_SLOT: '5',
        CBT_TEST_COUCHBASE_USER: 'x',
      },
    },
  );
  assert.equal(r.status, 0, r.stderr.toString());
  const out = r.stdout.toString();
  // E2E keeps only its own slot, so the CI slot is dropped there.
  assert.doesNotMatch(out, /^CBT_CI_SLOT=/m);
  assert.doesNotMatch(out, /^CBT_TEST_COUCHBASE_USER=/m);
});
