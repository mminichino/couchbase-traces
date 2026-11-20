import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const E2E_ENV = path.join(REPO, 'scripts', 'e2e-env.sh');

/** Environment after `. e2e-env.sh && cbt_e2e_isolate_env`, from `env`. */
function isolate(env) {
  const r = spawnSync(
    'bash',
    ['-c', `. "${E2E_ENV}" && cbt_e2e_isolate_env && env`],
    { env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env } },
  );
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

test('an exported admin password cannot reach the E2E stack', () => {
  const { vars } = isolate({
    CBT_COUCHBASE_ADMIN_PASSWORD: 'dev-admin-password',
  });
  assert.equal(vars.CBT_COUCHBASE_ADMIN_PASSWORD, 'cbt-test-admin');
  assert.equal(vars.CBT_COUCHBASE_ADMIN_USER, 'Administrator');
  assert.equal(vars.COUCHBASE_PASSWORD, 'cbt-test-admin');
  assert.equal(vars.COUCHBASE_USERNAME, 'Administrator');
});

test('drops other inherited CBT_* and COUCHBASE_* overrides', () => {
  const { vars, stderr } = isolate({
    CBT_METADATA_CONNSTR: 'couchbase://dev-host',
    CBT_METADATA_PASSWORD: 'secret-value',
    COUCHBASE_URL: 'http://elsewhere:8093',
  });
  assert.equal(vars.CBT_METADATA_CONNSTR, undefined);
  assert.equal(vars.CBT_METADATA_PASSWORD, undefined);
  assert.equal(vars.COUCHBASE_URL, undefined);
  assert.match(stderr, /CBT_METADATA_CONNSTR/);
  // Names only, never values.
  assert.doesNotMatch(stderr, /secret-value/);
});

test('keeps the documented slot, port, and portal overrides', () => {
  const { vars, stderr } = isolate({
    CBT_E2E_SLOT: '7',
    CBT_E2E_API_PORT: '21007',
    CBT_SLOT_FROM: 'path',
    CBT_PORTAL_PORT: '9901',
  });
  assert.equal(vars.CBT_E2E_SLOT, '7');
  assert.equal(vars.CBT_E2E_API_PORT, '21007');
  assert.equal(vars.CBT_SLOT_FROM, 'path');
  assert.equal(vars.CBT_PORTAL_PORT, '9901');
  assert.equal(stderr, '');
});
