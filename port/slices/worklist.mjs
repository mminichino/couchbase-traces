#!/usr/bin/env node
/**
 * Writes port/state/slices/<slice>.json for Phase 7 feature ports.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

const SLICE_AREAS = {
  search: ['search'],
  charts: ['charts', 'dashboards'],
  traces: ['traces', 'service_map'],
  metrics: ['metrics'],
  sessions: ['sessions'],
  presets: ['presets'],
};

const CORE_MODULES = [
  'packages/common-utils/src/core/renderChartConfig.ts',
  'packages/common-utils/src/core/searchChartConfig.ts',
  'packages/common-utils/src/core/eventDeltas.ts',
  'packages/common-utils/src/core/heatmap.ts',
  'packages/common-utils/src/core/histogram.ts',
  'packages/common-utils/src/core/spanPredicates.ts',
  'packages/common-utils/src/core/formula.ts',
  'packages/common-utils/src/core/builderToRawSql.ts',
  'packages/common-utils/src/core/materializedViews.ts',
  'packages/common-utils/src/dashboardFilterValues.ts',
].map(p => join(root, p));

const FN_RE =
  /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)|^(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=/gm;

function readJson(rel) {
  return JSON.parse(readFileSync(join(root, rel), 'utf8'));
}

function functionsInFile(path) {
  const text = readFileSync(path, 'utf8');
  const names = [];
  let m;
  while ((m = FN_RE.exec(text))) {
    const name = m[1] ?? m[2];
    if (name && !name.startsWith('_')) names.push(name);
  }
  return names;
}

function closureFilesForAreas(areas, parity, features) {
  const areaSet = new Set(areas);
  const files = new Set();
  for (const f of features.features) {
    if (!areaSet.has(f.area)) continue;
    if (f.status === 'needs_decision' || f.status === 'dropped') continue;
    const pf = parity.features.find(p => p.id === f.id);
    if (!pf) continue;
    for (const ep of pf.entryPoints ?? []) {
      if (ep.file) files.add(ep.file);
    }
    for (const p of pf.exclusiveFiles ?? []) files.add(p);
    for (const t of [
      ...(pf.tests?.unit ?? []),
      ...(pf.tests?.int ?? []),
      ...(pf.tests?.e2e ?? []),
    ]) {
      files.add(t);
    }
  }
  return files;
}

function coreFunctionsForClosure(files) {
  const referenced = new Set();
  for (const rel of files) {
    const path = join(root, rel);
    let text;
    try {
      text = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    for (const name of text.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) ?? []) {
      referenced.add(name);
    }
  }
  const out = [];
  for (const mod of CORE_MODULES) {
    const rel = mod.replace(root + '/', '');
    for (const name of functionsInFile(mod)) {
      if (name.startsWith('promql')) continue;
      if (referenced.has(name) || referenced.has(name.replace(/Couchbase$/, ''))) {
        out.push({ file: rel, name });
      }
    }
  }
  // Always include primary render entry points for chart slices.
  out.push({
    file: 'packages/common-utils/src/couchbase/render/index.ts',
    name: 'renderChartConfigCouchbase',
  });
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.name.localeCompare(b.name));
}

function appQuerySites(sqlCatalog, files) {
  const sites = sqlCatalog.appSites ?? [];
  return sites
    .filter(s => files.has(s.path))
    .map(s => ({
      path: s.path,
      rawSql: s.rawSql ?? 0,
      typeNames: s.typeNames ?? 0,
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function dataLayerSymbols(datalayer, files) {
  const out = [];
  for (const m of datalayer.modules ?? []) {
    if (!files.has(m.path)) continue;
    const symbols = new Set();
    for (const imp of m.importers ?? []) {
      if (!files.has(imp.path)) continue;
      for (const s of imp.symbols ?? []) symbols.add(s.name);
    }
    if (symbols.size) {
      out.push({ path: m.path, symbols: [...symbols].sort() });
    }
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

function collectTests(tests, parityFeatures, areas) {
  const areaSet = new Set(areas);
  const unit = new Set();
  const int = new Set();
  const e2e = new Set();
  for (const pf of parityFeatures) {
    if (!areaSet.has(pf.area)) continue;
    for (const p of pf.tests?.unit ?? []) unit.add(p);
    for (const p of pf.tests?.int ?? []) int.add(p);
    for (const p of pf.tests?.e2e ?? []) e2e.add(p);
  }
  return {
    unit: [...unit].sort(),
    int: [...int].sort(),
    e2e: [...e2e].sort(),
  };
}

const slice = process.argv[2];
if (!slice || !SLICE_AREAS[slice]) {
  console.error(`Usage: node port/slices/worklist.mjs <${Object.keys(SLICE_AREAS).join('|')}>`);
  process.exit(1);
}

const features = readJson('port/features.json');
const parity = readJson('port/state/inventory/parity.json');
const sqlCatalog = readJson('port/state/inventory/sql-catalog.json');
const datalayer = readJson('port/state/inventory/datalayer.json');

const areas = SLICE_AREAS[slice];
const sliceFeatures = features.features
  .filter(f => areas.includes(f.area))
  .filter(f => f.status !== 'needs_decision' && f.status !== 'dropped')
  .map(f => ({
    id: f.id,
    name: f.name,
    status: f.status,
    entryPoints: f.entryPoints,
  }));

const closureFiles = closureFilesForAreas(areas, parity, features);
const worklist = {
  slice,
  features: sliceFeatures,
  coreFunctions: coreFunctionsForClosure(closureFiles),
  appQuerySites: appQuerySites(sqlCatalog, closureFiles),
  dataLayerSymbols: dataLayerSymbols(datalayer, closureFiles),
  tests: collectTests(null, parity.features, areas),
};

mkdirSync(join(root, 'port/state/slices'), { recursive: true });
const outPath = join(root, 'port/state/slices', `${slice}.json`);
writeFileSync(outPath, JSON.stringify(worklist, null, 2) + '\n');
console.error(`Wrote ${outPath}`);
