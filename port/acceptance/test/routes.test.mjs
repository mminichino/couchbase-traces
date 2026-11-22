import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import {
  collectRouteSmokeEntries,
  fillDynamicSegments,
  generateRouteSmokeSpec,
} from '../lib/routes.mjs';

function writeFeatures(root, features) {
  mkdirSync(join(root, 'port/acceptance'), { recursive: true });
  writeFileSync(
    join(root, 'port/features.json'),
    JSON.stringify({ schemaVersion: 1, features }),
  );
  writeFileSync(join(root, 'port/acceptance/console-allowlist.json'), '[]');
}

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

  it('resolves [alertId] to the seeded alert and adds a not-found route', () => {
    const root = mkdtempSync(join(tmpdir(), 'cbt-routes-'));
    writeFeatures(root, [
      {
        id: 'app-alerts',
        status: 'ported',
        entryPoints: ['app_page:/alerts/[alertId]'],
      },
    ]);
    const entries = collectRouteSmokeEntries(root);
    assert.deepEqual(
      entries.map(e => [e.path, e.resolve, e.expectText]),
      [
        ['/alerts/[alertId]', 'seededAlert', undefined],
        ['/alerts/smoke-alert', undefined, 'Alert not found'],
      ],
    );
    const spec = generateRouteSmokeSpec(root);
    assert.match(spec, /resolve: 'seededAlert'/);
    assert.match(spec, /expectText: 'Alert not found'/);
    assert.match(spec, /SEEDED_ERROR_ALERT/);
  });
});
