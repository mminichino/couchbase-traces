#!/usr/bin/env node
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { anchorTime } from './anchor.mjs';
import { captureIngestSummary, INGEST_TABLES } from './ingest-canon.mjs';
import { defaultCompareRules, writeGoldenFile } from './golden-io.mjs';

const cbUrl = process.env.CB_URL;
const outDir = process.env.GOLDEN_CAPTURE_DIR;
const anchorMs = Number(process.env.GOLDEN_ANCHOR_MS || anchorTime().getTime());

if (!cbUrl || !outDir) {
  console.error('[capture-ingest] set CB_URL and GOLDEN_CAPTURE_DIR');
  process.exit(1);
}

const summary = await captureIngestSummary(cbUrl);
for (const table of INGEST_TABLES) {
  const data = summary.tables[table];
  writeGoldenFile(
    join(outDir, 'ingest'),
    {
      schemaVersion: 1,
      suite: 'ingest',
      caseId: table,
      datasetSeed: 0,
      anchorSensitive: false,
      compare: { ...defaultCompareRules(), ordered: true },
      result: data,
    },
    anchorMs,
  );
  console.error(`[capture-ingest] ${table} count=${data.count}`);
}
