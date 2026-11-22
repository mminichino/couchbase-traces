/**
 * Integration-run hang watchdog (docs/port-notes.md, "PR #27 shard 1 stall").
 *
 * Jest buffers a test file's console output until the file finishes, so a
 * suite that stalls prints nothing until the CI job timeout cancels it: PR #27
 * and main@a66fcf0 each spent ~34 silent minutes after provisionDashboards.
 * A worker thread keeps running while the main thread is blocked, writes
 * straight to fd 2 (bypassing Jest's buffer), and kills the process so the job
 * fails in minutes with the stalled file and test named.
 */
import { Worker } from 'node:worker_threads';

// The slowest legitimate CI file (external-api/dashboards) takes ~13 min; the
// event-loop check below is the precise one, this is only the backstop.
const FILE_BUDGET_MS = Number(
  process.env.CBT_INT_FILE_BUDGET_MS ?? 25 * 60_000,
);
const BLOCKED_MS = Number(process.env.CBT_INT_BLOCKED_MS ?? 120_000);

// The heartbeat is a counter, not a timestamp: tests that fake timers also
// fake Date, but the worker's own clock stays real.
const WATCHDOG_SRC = `
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
const beat = new Int32Array(workerData.sab);
const started = Date.now();
let phase = 'module load / beforeAll';
let lastBeat = 0;
let lastBeatAt = Date.now();
let fired = false;
parentPort.on('message', m => {
  if (m === 'done') process.exit(0);
  phase = m;
});
setInterval(() => {
  const now = Date.now();
  const b = Atomics.load(beat, 0);
  if (b !== lastBeat) { lastBeat = b; lastBeatAt = now; }
  const why =
    now - lastBeatAt > workerData.blockedMs
      ? 'main thread event loop blocked for ' + Math.round((now - lastBeatAt) / 1000) + 's'
      : now - started > workerData.budgetMs
        ? 'test file still running after ' + Math.round((now - started) / 1000) + 's'
        : '';
  if (!why || fired) return;
  fired = true;
  fs.writeSync(2, '\\n[int-watchdog] ' + why + '\\n  file: ' + workerData.file + '\\n  at:   ' + phase + '\\n');
  parentPort.postMessage('dump');
  setTimeout(() => process.kill(process.pid, 'SIGKILL'), 5000);
}, 5000);
`;

const { testPath } = expect.getState();
const sab = new SharedArrayBuffer(4);
const beat = new Int32Array(sab);
const worker = new Worker(WATCHDOG_SRC, {
  eval: true,
  workerData: {
    sab,
    file: testPath ?? '(unknown)',
    budgetMs: FILE_BUDGET_MS,
    blockedMs: BLOCKED_MS,
  },
});
worker.unref();
// Reached only while the main thread is alive: name what keeps it busy.
worker.on('message', () => {
  process.stderr.write(
    `[int-watchdog] active resources: ${JSON.stringify(process.getActiveResourcesInfo())}\n`,
  );
});

const heartbeat = setInterval(() => Atomics.add(beat, 0, 1), 1000);
heartbeat.unref();

beforeEach(() => {
  worker.postMessage(`test: ${expect.getState().currentTestName ?? '?'}`);
});

afterEach(() => {
  worker.postMessage(
    `afterEach: ${expect.getState().currentTestName ?? '?'} / afterAll`,
  );
});

afterAll(() => {
  clearInterval(heartbeat);
  worker.postMessage('done');
});
