// Case 28: docs/port-notes.md block replacement, plus parity.md and truncation rules.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';

import { summarizeWarnings } from '../lib/context.mjs';
import { AREAS, skeleton } from '../lib/features.mjs';
import { computeParity } from '../lib/parity.mjs';
import {
  PHASE2_END,
  PHASE2_START,
  renderNotesBlock,
  renderParityMd,
  replaceBlock,
} from '../lib/render.mjs';
import { cleanup, makeRepo, scanAll } from './helpers.mjs';

describe('render', () => {
  /** @type {string} */
  let root;
  /** @type {ReturnType<typeof scanAll>} */
  let r;
  /** @type {any} */
  let all;
  before(() => {
    root = makeRepo();
    r = scanAll(root);
    all = {
      importCommit: '0123456789abcdef0123456789abcdef01234567',
      workspaces: r.workspaces.workspaces,
      entryPoints: r.entry.entryPoints,
      dataLayer: r.data.modules,
      sql: r.sql,
      schema: r.schema,
      ingestion: r.ingestion,
      tests: r.tests,
      branding: r.branding,
      planCheck: r.plan,
      warnings: summarizeWarnings(r.ctx.warnings),
    };
  });
  after(() => cleanup(root));

  it('28. replaces only the Phase 2 block and keeps everything else', () => {
    const original = readFileSync(join(root, 'docs/port-notes.md'), 'utf8');
    const block = renderNotesBlock(all);
    assert.ok(block.startsWith(PHASE2_START));
    assert.ok(block.endsWith(PHASE2_END));
    assert.ok(block.includes('Inventory of commit 0123456789ab.'));

    const first = replaceBlock(original, PHASE2_START, PHASE2_END, block);
    const p1End = original.indexOf('<!-- phase1:end -->') + '<!-- phase1:end -->'.length;
    assert.equal(first.slice(0, p1End), original.slice(0, p1End), 'Phase 0 and 1 blocks untouched');
    assert.ok(first.slice(p1End).startsWith('\n\n' + PHASE2_START), 'placed after the Phase 1 block');
    assert.equal(first.replace(block, ''), original.slice(0, p1End) + '\n\n' + original.slice(p1End));
    assert.ok(first.endsWith('## Hand-written notes\n\nKeep this section exactly as written.\n'));

    // A second run replaces in place.
    const block2 = block.replace('### Warnings', '### Warnings changed');
    const second = replaceBlock(first, PHASE2_START, PHASE2_END, block2);
    assert.equal(second.replace(block2, ''), first.replace(block, ''));
    assert.ok(second.includes('### Warnings changed'));
    assert.equal(second.split(PHASE2_START).length, 2, 'one block');
    // Re-applying the same block is a no-op.
    assert.equal(replaceBlock(first, PHASE2_START, PHASE2_END, block), first);
  });

  it('renders every section in order', () => {
    const block = renderNotesBlock(all);
    const headings = [...block.matchAll(/^### (.+)$/gm)].map(m => m[1]);
    assert.deepEqual(headings, [
      'Workspace map',
      'Entry points',
      'Data layer',
      'Server-side data-store callers',
      'UI code with raw SQL or ClickHouse type names',
      'ClickHouse constructs without a SQL++ mapping',
      'Mapped constructs in use',
      'Schema',
      'Ingestion',
      'Integration test dependencies',
      'Branding',
      'Plan corrections',
      'Warnings',
    ]);
    assert.ok(block.includes('| Package | Directory | Role | Languages | Source files | Test files | CI targets |'));
    assert.ok(block.includes('| Category | hyperdx | clickstack | clickhouse | deploysentinel | hdx |'));
    assert.ok(block.includes('Materialized views:'));
    assert.ok(block.includes('`packages/api/src/controllers/chart.ts`: `packages/common-utils/src/core/metadata.ts`'));
    assert.ok(block.includes('No suggestion.'));
  });

  it('truncates tables over 100 rows by occurrences and notes the rest', () => {
    const constructs = Array.from({ length: 150 }, (_, i) => ({
      category: 'function',
      name: `fn${String(i).padStart(3, '0')}`,
      classification: 'unmapped',
      sqlppApproach: null,
      occurrences: i + 1,
      files: [],
    }));
    const block = renderNotesBlock({ ...all, sql: { ...all.sql, constructs } });
    assert.ok(block.includes('Plus 50 more in sql-catalog.json.'));
    assert.ok(block.includes('`fn149`'));
    assert.equal(block.includes('`fn000`'), false);
  });

  it('renders parity.md with the documented layout', () => {
    const file = skeleton(r.entry.entryPoints);
    for (const f of file.features) {
      f.name = `Name ${f.id}`;
      f.description = `Description of ${f.id}.`;
    }
    const q = file.features.find(f => f.id === 'api-clickhouse-proxy');
    assert.ok(q);
    q.status = 'needs_decision';
    q.decision = { note: 'Proxies queries to ClickHouse', signedOffBy: null, date: null };
    const parity = computeParity(file, r.entry.entryPoints, r.imports, r.data, r.tests, r.ctx.files);
    const md = renderParityMd(parity, file);
    assert.ok(md.startsWith('# Parity checklist\n\nGenerated from `port/features.json`'));
    assert.ok(md.includes('| needs_decision | 1 |'));
    assert.ok(md.includes('| not_started | ' + (file.features.length - 1) + ' |'));
    assert.ok(md.includes('| Feature | Visibility | Status | Entry points | Data layer | Tests (unit / int / e2e) |'));
    assert.ok(md.includes('| Name api-clickhouse-proxy (`api-clickhouse-proxy`) | internal | needs_decision | 1 |'));
    assert.ok(md.includes('Decision: Proxies queries to ClickHouse. Not signed off.'));
    assert.equal(md.match(/^Decision:/gm)?.length, 1, 'only features with a decision');
    const areas = [...md.matchAll(/^## (.+)$/gm)].map(m => m[1]);
    const present = new Set(file.features.map(f => f.area));
    assert.deepEqual(areas, AREAS.filter(a => present.has(a)));
    assert.ok(md.endsWith('\n') && !md.endsWith('\n\n'));
  });
});
