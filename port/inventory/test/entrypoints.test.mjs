// Cases 7 to 11: entry point discovery.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { cleanup, codes, makeRepo, scanAll } from './helpers.mjs';

describe('entrypoints', () => {
  /** @type {string} */
  let root;
  /** @type {ReturnType<typeof scanAll>} */
  let r;
  before(() => {
    root = makeRepo();
    r = scanAll(root);
  });
  after(() => cleanup(root));

  const ids = () => r.entry.entryPoints.map(e => e.id);

  it('7. discovers pages and app API routes', () => {
    const pages = r.entry.entryPoints.filter(e => e.kind === 'app_page').map(e => e.key);
    assert.deepEqual(pages, ['/', '/search', '/x/[id]']);
    const api = r.entry.entryPoints.filter(e => e.kind === 'app_api_route').map(e => e.key);
    assert.deepEqual(api, ['/api/[...all]', '/api/config']);
    assert.equal(
      r.entry.entryPoints.some(e => e.file.endsWith('_app.tsx')),
      false,
    );
  });

  it('8. joins mount prefixes through a nested router', () => {
    assert.ok(ids().includes('api_route:GET /sources'));
    assert.ok(ids().includes('api_route:GET /sources/items'));
    assert.ok(ids().includes('api_route:POST /sources/items'), 'route() chains are recorded');
    const post = r.entry.entryPoints.find(e => e.id === 'api_route:POST /api/v2/alerts/:id');
    assert.ok(post);
    assert.deepEqual(post.detail, {
      method: 'POST',
      path: '/api/v2/alerts/:id',
      localPath: '/:id',
      routerFile: 'packages/api/src/routers/external-api/v2/alerts.ts',
      mounted: true,
    });
    assert.ok(ids().includes('api_route:GET /api/v2'));
    assert.ok(ids().includes('api_route:ALL /clickhouse-proxy/*'));
  });

  it('9. resolves mounts through a barrel', () => {
    // routers.teamRouter: default-exported object of imported routers.
    assert.ok(ids().includes('api_route:GET /team/members'));
    // named.meRouter: namespace import of a barrel that re-exports a default.
    assert.ok(ids().includes('api_route:GET /me'));
  });

  it('10. keys a router that is never mounted with a question mark', () => {
    const ep = r.entry.entryPoints.find(e => e.id === 'api_route:GET ?/orphan');
    assert.ok(ep);
    assert.equal(ep.detail.mounted, false);
    assert.ok(codes(r.ctx).includes('W_UNMOUNTED_ROUTER'));
  });

  it('11. finds MCP tools, tasks, and nested CLI commands', () => {
    const tool = r.entry.entryPoints.find(e => e.id === 'mcp_tool:fixture_search');
    assert.ok(tool);
    assert.deepEqual(tool.detail, { toolName: 'fixture_search', dir: 'query' });
    assert.ok(ids().includes('mcp_tool:fixture_misc'));

    const task = r.entry.entryPoints.find(e => e.id === 'task:check-alerts');
    assert.ok(task);
    assert.equal(task.file, 'packages/api/src/tasks/checkAlerts.ts');
    assert.deepEqual(task.detail, { enumMember: 'CHECK_ALERTS', className: 'CheckAlertTask' });
    assert.ok(ids().includes('task:ping'));

    for (const key of ['tui', 'auth', 'auth login', 'team', 'team list']) {
      assert.ok(ids().includes(`cli_command:${key}`), key);
    }
    assert.ok(ids().includes('ingestion:otel-collector'));
    assert.equal(new Set(ids()).size, ids().length, 'ids are unique');
  });
});
