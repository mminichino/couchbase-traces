import { savedChartConfigSupportsAlerts } from '@couchbase-traces/common-utils/dist/core/utils';
import {
  DashboardWithoutIdSchema,
  resolveChartPaletteToken,
  SavedChartConfig,
  Tile,
  walkRawDashboardTileColors,
} from '@couchbase-traces/common-utils/dist/types';
import { map, partition, uniq } from 'lodash';
import { z } from 'zod';

import {
  createOrUpdateDashboardAlerts,
  deleteDashboardAlerts,
  getDashboardAlertsByTile,
  getTeamDashboardAlertsByDashboardAndTile,
} from '@/controllers/alerts';
import { recordOnboardingTaskCompletion } from '@/controllers/user';
import {
  applyUserDisplays,
  loadUserDisplays,
  type UserDisplays,
} from '@/controllers/userDisplay';
import { getMetadataStore } from '@/metadata';
import type { IAlert } from '@/metadata/schemas/alert';
import type { IDashboard } from '@/metadata/schemas/dashboard';
import { resolveAlertDisplayFields } from '@/utils/alerts';

// Drop alerts on tiles the alert checker cannot evaluate (e.g. PromQL), so
// they are never stored and any existing ones are deleted on save.
function getSupportedTileAlert(tile: Tile) {
  return savedChartConfigSupportsAlerts(tile.config)
    ? tile.config.alert
    : undefined;
}

function pickAlertsByTile(tiles: Tile[]) {
  return tiles.reduce((acc, tile) => {
    const alert = getSupportedTileAlert(tile);
    if (alert) {
      acc[tile.id] = alert;
    }
    return acc;
  }, {});
}

// Completes only when a dashboard has a tile (an empty shell isn't charting).
// Shared by every dashboard write path (controllers, external REST v2, MCP).
export function recordDashboardOnboardingIfHasTiles(
  userId: string | undefined | null,
  tiles: { length: number } | null | undefined,
) {
  if ((tiles?.length ?? 0) > 0) {
    recordOnboardingTaskCompletion(userId, 'dashboard');
  }
}

/**
 * Rewrite any legacy `chart-1`..`chart-10` tile colors from #2265 in
 * an already-serialized dashboard JSON to their hue-named equivalents
 * before it leaves the server. Keeps the wire format on a single
 * canonical vocabulary so non-React HTTP clients (CI scripts, stale
 * bundle tabs during a rolling deploy, the upcoming external API
 * surface) never have to know about the legacy values, and so a
 * GET → unmodified PATCH round-trip on a legacy doc can
 * never resurrect the legacy tokens through the strict server-side
 * `ChartPaletteTokenSchema`. The React-side
 * `normalizeDashboardTileColors` becomes redundant for the wire path
 * after this lands but stays in place as defense in depth for
 * `IS_LOCAL_MODE` and in-memory tile literals.
 *
 * Unresolvable strings (stale hexes, hand-edited values, forward-rolled
 * future tokens) pass through untouched so the user's data is not
 * silently dropped; the strict schema surfaces a clear error on next
 * save.
 */
function healLegacyDashboardTileColors<T>(dashboard: T): T {
  return walkRawDashboardTileColors(dashboard, current => {
    const resolved = resolveChartPaletteToken(current);
    return resolved ?? current;
  }) as T;
}

type TileForAlertSync = Pick<Tile, 'id'> & {
  config?: Pick<SavedChartConfig, 'alert'> | { alert?: IAlert };
};

function extractTileAlertData(tiles: TileForAlertSync[]): {
  tileIds: Set<string>;
  tileIdsWithAlerts: Set<string>;
} {
  const [tilesWithAlerts, _] = partition(tiles, 'config.alert');
  const tileIds = new Set(map(tiles, 'id'));
  const tileIdsWithAlerts = new Set(map(tilesWithAlerts, 'id'));

  return { tileIds, tileIdsWithAlerts };
}

async function syncDashboardAlerts(
  dashboard: Pick<IDashboard, '_id' | 'name' | 'tags' | 'tiles'>,
  teamId: string,
  oldTiles: TileForAlertSync[],
  newTiles: Tile[],
  userId?: string,
): Promise<void> {
  const dashboardId = dashboard._id.toString();
  const { tileIds: oldTileIds, tileIdsWithAlerts: oldTileIdsWithAlerts } =
    extractTileAlertData(oldTiles);

  const newTilesForAlertSync: TileForAlertSync[] = newTiles.map(t => ({
    id: t.id,
    config: { alert: getSupportedTileAlert(t) },
  }));
  const { tileIds: newTileIds, tileIdsWithAlerts: newTileIdsWithAlerts } =
    extractTileAlertData(newTilesForAlertSync);

  // 1. Create/update alerts for tiles that have alerts
  const alertsByTile = pickAlertsByTile(newTiles);
  if (Object.keys(alertsByTile).length > 0) {
    await createOrUpdateDashboardAlerts(
      dashboard,
      teamId,
      alertsByTile,
      userId,
    );
  }

  // 2. Identify tiles whose alerts need to be deleted
  const tilesToDeleteAlertsFrom = new Set([
    // Tiles that were completely removed
    ...Array.from(oldTileIds).filter(id => !newTileIds.has(id)),
    // Tiles that exist but no longer have alerts
    ...Array.from(oldTileIdsWithAlerts).filter(
      id => newTileIds.has(id) && !newTileIdsWithAlerts.has(id),
    ),
  ]);

  // 3. Delete alerts
  if (tilesToDeleteAlertsFrom.size > 0) {
    await deleteDashboardAlerts(
      dashboardId,
      teamId,
      Array.from(tilesToDeleteAlertsFrom),
    );
  }
}

/**
 * Attach the resolved display name/tags so the chart editor prefills real
 * values for alerts written before the fields existed.
 */
function withResolvedDisplayFields(
  alert: IAlert | undefined,
  dashboard: Pick<IDashboard, 'name' | 'tags' | 'tiles'>,
  users: UserDisplays,
) {
  if (alert == null) {
    return undefined;
  }
  return {
    ...applyUserDisplays(users, alert, ['createdBy']),
    ...resolveAlertDisplayFields(alert, { dashboard }),
  };
}

export async function getDashboards(teamId: string) {
  const [_dashboards, alerts] = await Promise.all([
    getMetadataStore().dashboards.list(teamId.toString()),
    getTeamDashboardAlertsByDashboardAndTile(teamId),
  ]);
  const users = await loadUserDisplays([
    ..._dashboards.flatMap(d => [d.createdBy, d.updatedBy]),
    ...Object.values(alerts).flatMap(a => a.map(x => x.createdBy)),
  ]);

  const dashboards = _dashboards
    .map(d => ({
      ...applyUserDisplays(users, d, ['createdBy', 'updatedBy']),
      tiles: d.tiles.map(t => ({
        ...t,
        config: {
          ...t.config,
          alert: withResolvedDisplayFields(
            alerts[`${d._id.toString()}:${t.id}`]?.[0],
            d,
            users,
          ),
        },
      })),
    }))
    .map(healLegacyDashboardTileColors);

  return dashboards;
}

export async function getDashboard(dashboardId: string, teamId: string) {
  const [_dashboard, alerts] = await Promise.all([
    getMetadataStore().dashboards.get(teamId.toString(), dashboardId),
    getDashboardAlertsByTile(teamId, dashboardId),
  ]);

  if (_dashboard == null) {
    return null;
  }
  const users = await loadUserDisplays([
    _dashboard.createdBy,
    _dashboard.updatedBy,
    ...Object.values(alerts).flatMap(a => a.map(x => x.createdBy)),
  ]);

  return healLegacyDashboardTileColors({
    ...applyUserDisplays(users, _dashboard, ['createdBy', 'updatedBy']),
    tiles: _dashboard.tiles.map(t => ({
      ...t,
      config: {
        ...t.config,
        alert: withResolvedDisplayFields(alerts[t.id]?.[0], _dashboard, users),
      },
    })),
  });
}

export async function createDashboard(
  teamId: string,
  dashboard: z.infer<typeof DashboardWithoutIdSchema>,
  userId?: string,
) {
  const newDashboard = await getMetadataStore().dashboards.create(
    teamId.toString(),
    dashboard,
    userId?.toString(),
  );

  await createOrUpdateDashboardAlerts(
    newDashboard,
    teamId,
    pickAlertsByTile(dashboard.tiles),
    userId,
  );

  recordDashboardOnboardingIfHasTiles(userId, newDashboard.tiles);

  return newDashboard;
}

export async function deleteDashboard(dashboardId: string, teamId: string) {
  // One transaction removes the dashboard and every alert on its tiles.
  await getMetadataStore().dashboards.deleteWithAlerts(
    teamId.toString(),
    dashboardId,
  );
}

export async function updateDashboard(
  dashboardId: string,
  teamId: string,
  updates: Partial<z.infer<typeof DashboardWithoutIdSchema>>,
  userId?: string,
) {
  // Defense-in-depth: callers pass spread objects into the update below.
  // A smuggled `team`/`createdBy` would move the document between tenants or
  // forge ownership, so it is refused outright (the repository also pins
  // both).
  const {
    team: _ignoredTeam,
    createdBy: _ignoredCreatedBy,
    ...safeUpdates
  } = updates as Record<string, unknown>;
  if (_ignoredTeam !== undefined || _ignoredCreatedBy !== undefined) {
    throw new Error('updateDashboard: team/createdBy are not updatable');
  }

  const oldDashboard = await getDashboard(dashboardId, teamId);

  if (oldDashboard == null) {
    throw new Error('Dashboard not found');
  }

  const updatedDashboard = await getMetadataStore().dashboards.update(
    teamId.toString(),
    dashboardId,
    {
      ...safeUpdates,
      tags: updates.tags && uniq(updates.tags),
    },
    userId?.toString(),
  );
  if (updatedDashboard == null) {
    throw new Error('Could not update dashboard');
  }

  if (updates.tiles) {
    await syncDashboardAlerts(
      updatedDashboard,
      teamId,
      oldDashboard?.tiles || [],
      updates.tiles,
      userId,
    );
  }

  recordDashboardOnboardingIfHasTiles(userId, updatedDashboard.tiles);

  return updatedDashboard;
}
