import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isExempt } from '../lib/names.mjs';

describe('isExempt', () => {
  it('exempts legal files, port records, and port plans', () => {
    for (const p of [
      'LICENSE',
      'NOTICE',
      'docs/port-notes.md',
      'docs/history/PHASE_11_SPEC.md',
      'docs/upstream/AGENTS.md',
      'docs/mongo-elimination-plan.md',
      'docs/v1-release-plan.md',
      'port/rebrand/allowlist.json',
    ]) {
      assert.equal(isExempt(p), true, p);
    }
  });

  it('scans user-facing docs and source', () => {
    for (const p of ['README.md', 'DEPLOY.md', 'docs/release.md', 'docs/capella.md', 'Makefile']) {
      assert.equal(isExempt(p), false, p);
    }
  });
});
