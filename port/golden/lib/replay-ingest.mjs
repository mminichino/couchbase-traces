#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { captureIngestSummary, INGEST_TABLES } from './ingest-canon.mjs';
import { listGoldenCaseIds, readGoldenFile } from './golden-io.mjs';

const cbUrl = process.env.CB_URL;
const goldenDir = process.env.GOLDEN_DIR;
if (!cbUrl || !goldenDir) {
  console.error('[replay-ingest] set CB_URL and GOLDEN_DIR');
  process.exit(1);
}

const actual = await captureIngestSummary(cbUrl);
const errors = [];

for (const table of INGEST_TABLES) {
  const caseId = table;
  if (!listGoldenCaseIds(join(goldenDir, 'ingest')).includes(caseId)) continue;
  const golden = readGoldenFile(join(goldenDir, 'ingest'), caseId);
  const row = actual.tables[table];
  if (JSON.stringify(golden.result) !== JSON.stringify(row)) {
    errors.push(`ingest ${caseId}: mismatch`);
  }
}

if (errors.length) {
  for (const line of errors) console.error(`[replay-ingest] ${line}`);
  process.exit(1);
}
console.error('[replay-ingest] ok');
