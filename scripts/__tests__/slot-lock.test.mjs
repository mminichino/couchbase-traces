import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const REPO = path.resolve(import.meta.dirname, '..', '..');
const LOCK = path.join(REPO, 'scripts', 'slot-lock.sh');

function tmpLock() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'slot-lock-'));
  return path.join(dir, 'slot', 'int.lock');
}

function run(args, env = {}) {
  const r = spawnSync('bash', [LOCK, ...args], {
    env: { PATH: process.env.PATH, ...env },
  });
  return { status: r.status, stderr: r.stderr.toString() };
}

/** A PID that is not running: a child that has already exited. */
function deadPid() {
  const r = spawnSync('bash', ['-c', 'echo $$']);
  return r.stdout.toString().trim();
}

const holder = lock => fs.readFileSync(path.join(lock, 'pid'), 'utf8').trim();

test('acquire creates the lock with the owner pid; release removes it', () => {
  const lock = tmpLock();
  assert.equal(run(['acquire', lock, String(process.pid)]).status, 0);
  assert.equal(holder(lock), String(process.pid));
  assert.equal(run(['release', lock, String(process.pid)]).status, 0);
  assert.equal(fs.existsSync(lock), false);
});

test('the owner re-acquires without waiting (one lock per make run)', () => {
  const lock = tmpLock();
  run(['acquire', lock, String(process.pid)]);
  const r = run(['acquire', lock, String(process.pid)], {
    CBT_SLOT_LOCK_WAIT_S: '0',
  });
  assert.equal(r.status, 0, r.stderr);
});

test('a second run waits for a live holder and fails at the bound', () => {
  const lock = tmpLock();
  run(['acquire', lock, String(process.pid)]);
  const r = run(['acquire', lock, deadPid()], { CBT_SLOT_LOCK_WAIT_S: '1' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /waiting for pid \d+/);
  assert.match(r.stderr, /still held by pid \d+ after 1s/);
  assert.equal(holder(lock), String(process.pid));
});

test('a second run proceeds once the holder releases', async () => {
  const lock = tmpLock();
  run(['acquire', lock, String(process.pid)]);
  const waiter = spawn('bash', [LOCK, 'acquire', lock, '424242'], {
    env: { PATH: process.env.PATH, CBT_SLOT_LOCK_WAIT_S: '20' },
  });
  const done = new Promise(resolve => waiter.on('exit', resolve));
  await new Promise(r => setTimeout(r, 1500));
  run(['release', lock, String(process.pid)]);
  assert.equal(await done, 0);
  assert.equal(holder(lock), '424242');
});

test('a lock left by an exited run is taken over', () => {
  const lock = tmpLock();
  const gone = deadPid();
  run(['acquire', lock, gone]);
  const r = run(['acquire', lock, String(process.pid)], {
    CBT_SLOT_LOCK_WAIT_S: '0',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stderr, new RegExp(`took over .* from exited pid ${gone}`));
  assert.equal(holder(lock), String(process.pid));
  assert.deepEqual(
    fs.readdirSync(path.dirname(lock)).filter(n => n.includes('.stale.')),
    [],
  );
});

test('release by a non-owner leaves the lock in place', () => {
  const lock = tmpLock();
  run(['acquire', lock, String(process.pid)]);
  assert.equal(run(['release', lock, '1']).status, 0);
  assert.equal(holder(lock), String(process.pid));
});

test('rejects a missing argument', () => {
  assert.equal(run(['acquire', tmpLock()]).status, 2);
  assert.equal(run(['bogus', tmpLock(), '1']).status, 2);
});
