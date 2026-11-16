import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  collectRouteSmokeEntries,
  fillDynamicSegments,
} from '../lib/routes.mjs';

describe('route smoke generator', () => {
  it('fills dynamic segments', () => {
    assert.equal(
      fillDynamicSegments('/dashboards/[dashboardId]', {
        dashboardId: 'abc',
      }),
      '/dashboards/abc',
    );
  });

  it('skips dropped features and fills dynamics', () => {
    const root = mkdtempSync(join(tmpdir(), 'cbt-routes-'));
    mkdirSync(join(root, 'port'), { recursive: true });
    writeFileSync(
      join(root, 'port/features.json'),
      JSON.stringify({
        schemaVersion: 1,
        features: [
          {
            id: 'app-dashboards',
            status: 'ported',
            entryPoints: ['app_page:/dashboards/[dashboardId]'],
          },
          {
            id: 'app-careers',
            status: 'dropped',
            entryPoints: ['app_page:/careers'],
            decision: { signedOffBy: 'x', date: '2026-01-01' },
          },
          {
            id: 'app-search',
            status: 'ported',
            entryPoints: ['app_page:/search'],
          },
        ],
      }),
    );
    const entries = collectRouteSmokeEntries(root, {
      dashboardId: 'dash-1',
    });
    assert.equal(entries.some(e => e.route === '/careers'), false);
    assert.ok(entries.some(e => e.path === '/dashboards/dash-1'));
    assert.ok(entries.some(e => e.path === '/search'));
  });
});
