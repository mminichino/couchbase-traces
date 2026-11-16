#!/usr/bin/env node
import { join } from 'node:path';
import { captureIngestSummary, INGEST_TABLES } from './ingest-canon.mjs';
import { listGoldenCaseIds, readGoldenFile } from './golden-io.mjs';

const cbUrl = process.env.CB_URL;
const goldenDir = process.env.GOLDEN_DIR;
if (!cbUrl || !goldenDir) {
  console.error('[replay-ingest] set CB_URL and GOLDEN_DIR');
  process.exit(1);
}

const ISO_RE = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(\.\d+)?Z/;

/**
 * Ingest goldens store absolute timestamps in row keys. Payloads are generated
 * relative to the current Monday anchor, so keys shift by whole weeks. Align
 * expected keys to the actual run by the delta of the first shared ISO stamp.
 * @param {{ count: number, keys: string[] }} expected
 * @param {{ count: number, keys: string[] }} actual
 */
function alignExpectedKeys(expected, actual) {
  if (!expected?.keys?.length || !actual?.keys?.length) return expected;
  const expMatch = ISO_RE.exec(expected.keys[0] ?? '');
  const actMatch = ISO_RE.exec(actual.keys[0] ?? '');
  if (!expMatch || !actMatch) return expected;
  const expMs = Date.parse(`${expMatch[1]}Z`);
  const actMs = Date.parse(`${actMatch[1]}Z`);
  if (!Number.isFinite(expMs) || !Number.isFinite(actMs)) return expected;
  const deltaMs = actMs - expMs;
  if (deltaMs === 0) return expected;
  const keys = expected.keys.map(key =>
    key.replace(ISO_RE, (_, head, frac = '') => {
      const next = new Date(Date.parse(`${head}Z`) + deltaMs);
      const base = next.toISOString().replace(/\.\d{3}Z$/, '');
      return `${base}${frac}Z`;
    }),
  );
  return { ...expected, keys };
}

const actual = await captureIngestSummary(cbUrl);
const errors = [];

for (const table of INGEST_TABLES) {
  const caseId = table;
  if (!listGoldenCaseIds(join(goldenDir, 'ingest')).includes(caseId)) continue;
  const golden = readGoldenFile(join(goldenDir, 'ingest'), caseId);
  const row = actual.tables[table];
  const expected = alignExpectedKeys(golden.result, row);
  if (JSON.stringify(expected) !== JSON.stringify(row)) {
    errors.push(
      `ingest ${caseId}: mismatch expected=${JSON.stringify(expected)} actual=${JSON.stringify(row)}`,
    );
  }
}

if (errors.length) {
  for (const line of errors) console.error(`[replay-ingest] ${line}`);
  process.exit(1);
}
console.error('[replay-ingest] ok');
