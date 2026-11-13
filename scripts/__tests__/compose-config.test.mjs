import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(root, 'scripts/ci/check-compose-config.sh');

test('docker compose files parse (PHASE_9_SPEC §15 #5)', () => {
  const result = spawnSync('bash', [script], { cwd: root, encoding: 'utf8' });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  assert.equal(
    result.status,
    0,
    `check-compose-config.sh failed: ${result.stderr || result.stdout}`,
  );
});
