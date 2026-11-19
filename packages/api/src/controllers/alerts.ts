import {
  displayTypeSupportsBuilderAlerts,
  displayTypeSupportsRawSqlAlerts,
  isFormulaSourceKind,
  savedChartConfigSupportsAlerts,
  validateRawSqlForAlert,
} from '@couchbase-traces/common-utils/dist/core/utils';
import {
  isPromqlSavedChartConfig,
  isRawSqlSavedChartConfig,
} from '@couchbase-traces/common-utils/dist/guards';
import { isRangeThresholdType } from '@couchbase-traces/common-utils/dist/types';
import { groupBy } from 'lodash';
import { z } from 'zod';

import { hydrateAlertRefs } from '@/controllers/alertRefs';
import { recordOnboardingTaskCompletion } from '@/controllers/user';
import { getMetadataStore } from '@/metadata';
import type { Id } from '@/metadata/ids';
import {
  AlertChannel,
  AlertFields,
  AlertSource,
  getAlertChannels,
  IAlert,
} from '@/metadata/schemas/alert';
import type { IDashboard } from '@/metadata/schemas/dashboard';
import { type AlertRefs, deriveAlertDisplayFields } from '@/utils/alerts';
import { Api400Error } from '@/utils/errors';
import { idSchema, internalAlertSchema } from '@/utils/zod';

export type AlertInput = Omit<
  IAlert,
  | '_id'
  | 'id'
  | 'channel'
  | 'scheduleStartAt'
  | 'savedSearchId'
  | 'createdAt'
  | 'createdBy'
  | 'updatedAt'
  | 'team'
  | 'state'
> & {
  id?: string;
  // Exactly one of channel/channels is provided (enforced by alertSchema);
  // `channels` flows in optionally via IAlert.
  channel?: AlertChannel;
  // Replace the Date-type fields from IAlert
  scheduleStartAt?: string | null;
  // Replace the id fields from IAlert
  savedSearchId?: string;
  dashboardId?: string;
};

function validateId(
  id: string | undefined,
  message: string,
): asserts id is string {
  if (idSchema.safeParse(id).success === false) {
    throw new Api400Error(message);
  }
}

export const validateAlertInput = async (
  teamId: string,
  alertInput: Pick<
    AlertInput,
    | 'source'
    | 'dashboardId'
    | 'tileId'
    | 'savedSearchId'
    | 'chartConfig'
    | 'channel'
    | 'channels'
  >,
) => {
  const refs: AlertRefs = {};

  if (alertInput.source === AlertSource.TILE) {
    validateId(alertInput.dashboardId, 'Invalid dashboard ID');

    const dashboard = await getMetadataStore().dashboards.get(
      teamId.toString(),
      alertInput.dashboardId,
    );

    if (dashboard == null) {
      throw new Api400Error('Dashboard not found');
    }
    refs.dashboard = dashboard;

    const tile = dashboard.tiles.find(tile => tile.id === alertInput.tileId);

    if (tile == null) {
      throw new Api400Error('Tile not found');
    }

    // The alert checker cannot evaluate these tiles, so the alert would never run.
    if (tile.config != null && !savedChartConfigSupportsAlerts(tile.config)) {
      if (isPromqlSavedChartConfig(tile.config)) {
        throw new Api400Error('Alerts are not supported on PromQL tiles');
      }
      const tileKind = isRawSqlSavedChartConfig(tile.config)
        ? 'Raw SQL tiles'
        : 'dashboard tiles';
      throw new Api400Error(
        `Alerts on ${tileKind} are only supported for Line, Stacked Bar, or Number display types`,
      );
    }

    if (tile.config != null && isRawSqlSavedChartConfig(tile.config)) {
      const { errors } = validateRawSqlForAlert(tile.config);
      if (errors.length > 0) {
        throw new Api400Error(
          `Raw SQL alert query is invalid: ${errors.join(', ')}`,
        );
      }
    }
  }

  if (alertInput.source === AlertSource.SAVED_SEARCH) {
    validateId(alertInput.savedSearchId, 'Invalid saved search ID');

    const savedSearch = await getMetadataStore().savedSearches.get(
      teamId.toString(),
      alertInput.savedSearchId,
    );

    if (savedSearch == null) {
      throw new Api400Error('Saved search not found');
    }
    refs.savedSearch = savedSearch;
  }

  if (alertInput.source === AlertSource.INLINE) {
    const chartConfig = alertInput.chartConfig;
    if (chartConfig == null) {
      throw new Api400Error('Chart config is required');
    }

    if (isRawSqlSavedChartConfig(chartConfig)) {
      if (!displayTypeSupportsRawSqlAlerts(chartConfig.displayType)) {
        throw new Api400Error(
          'Alerts on Raw SQL charts are only supported for Line, Stacked Bar, or Number display types',
        );
      }

      const { errors } = validateRawSqlForAlert(chartConfig);
      if (errors.length > 0) {
        throw new Api400Error(
          `Raw SQL alert query is invalid: ${errors.join(', ')}`,
        );
      }

      // Raw SQL configs carry the connection directly; the source reference
      // is optional metadata for macro expansion ($__sourceTable).
      validateId(chartConfig.connection, 'Invalid connection ID');
      const connection = await getMetadataStore().connections.get(
        teamId.toString(),
        chartConfig.connection,
      );
      if (connection == null) {
        throw new Api400Error('Connection not found');
      }
      if (chartConfig.source) {
        validateId(chartConfig.source, 'Invalid source ID');
        const source = await getMetadataStore().sources.get(
          teamId.toString(),
          chartConfig.source,
        );
        if (source == null) {
          throw new Api400Error('Source not found');
        }
        // The worker executes the query through chartConfig.connection while
        // expanding $__sourceTable/metricTables from this source. Accepting a
        // source on a different (even team-owned) connection would query the
        // wrong database — silently wrong values when the table also exists
        // there, repeated query failures when it does not.
        //
        // Compare case-insensitively: idSchema admits uppercase hex,
        // and ids are stored lowercase.
        if (
          source.connection.toLowerCase() !==
          chartConfig.connection.toLowerCase()
        ) {
          throw new Api400Error(
            'Source does not belong to the specified connection',
          );
        }
      }
    } else {
      // Builder configs: same display types the alert task can evaluate as a
      // time series (mirrors the tile-alert rules).
      if (!displayTypeSupportsBuilderAlerts(chartConfig.displayType)) {
        throw new Api400Error(
          'Inline chart alerts are only supported for Line, Stacked Bar, or Number display types',
        );
      }

      validateId(chartConfig.source, 'Invalid source ID');
      const source = await getMetadataStore().sources.get(
        teamId.toString(),
        chartConfig.source,
      );
      if (source == null) {
        throw new Api400Error('Source not found');
      }

      // Same formula source-kind gate as dashboard tiles ("Add Formula" is
      // disabled in the editor for these kinds), so the API cannot persist a
      // config the editor refuses.
      if (
        'formulas' in chartConfig &&
        (chartConfig.formulas?.length ?? 0) > 0 &&
        !isFormulaSourceKind(source.kind)
      ) {
        throw new Api400Error(
          'Alerts with formulas require a Metric, Log, or Trace source',
        );
      }
    }
  }

  const channels = getAlertChannels(alertInput);
  if (channels.length === 0) {
    throw new Api400Error('At least one notification channel is required');
  }

  const webhookIds = channels
    .filter(c => c.type === 'webhook')
    .map(c => c.webhookId);
  for (const webhookId of webhookIds) {
    validateId(webhookId, 'Invalid webhook ID');
  }
  const uniqueIds = [...new Set(webhookIds)];
  const found = await getMetadataStore().webhooks.getMany(
    teamId.toString(),
    uniqueIds,
  );
  if (found.size !== uniqueIds.length) {
    throw new Api400Error('Webhook not found');
  }

  return refs;
};

// Exported for unit testing the channel-mirroring invariant (see
// controllers/__tests__/alerts.test.ts) -- otherwise only used internally.
export const makeAlert = (
  alert: AlertInput,
  userId?: string,
  refs: AlertRefs = {},
): AlertFields => {
  // Preserve existing DB value when scheduleStartAt is omitted from updates
  // (undefined), while still allowing explicit clears via null.
  const hasScheduleStartAt = alert.scheduleStartAt !== undefined;
  // If scheduleStartAt is explicitly provided, offset-based alignment is ignored.
  // Force persisted offset to 0 so updates can't leave stale non-zero offsets.
  // If scheduleStartAt is explicitly cleared and offset is omitted, also reset
  // to 0 to avoid preserving stale values from older documents.
  const normalizedScheduleOffsetMinutes =
    hasScheduleStartAt && alert.scheduleStartAt != null
      ? 0
      : hasScheduleStartAt && alert.scheduleOffsetMinutes == null
        ? 0
        : alert.scheduleOffsetMinutes;
  const isSavedSearch = alert.source === AlertSource.SAVED_SEARCH;
  const isTile = alert.source === AlertSource.TILE;
  const isInline = alert.source === AlertSource.INLINE;
  const channels = getAlertChannels(alert);
  // If the input explicitly provides a non-null value, persist it. If the input omits the
  // field and a referenced entity is available, persist the value derived from the referenced entity.
  // Otherwise, null.
  const derivedDisplay = deriveAlertDisplayFields(alert, refs);
  const displayName = alert.displayName ?? derivedDisplay.displayName ?? null;
  const tags = alert.tags ?? derivedDisplay.tags ?? null;

  return {
    // `channels` is canonical; `channel` mirrors channels[0] so readers that
    // predate multi-channel support (older task runners mid-rollout) still
    // notify the first target.
    channel: channels[0] ?? { type: null },
    channels,
    interval: alert.interval,
    ...(normalizedScheduleOffsetMinutes != null && {
      scheduleOffsetMinutes: normalizedScheduleOffsetMinutes,
    }),
    ...(hasScheduleStartAt && {
      scheduleStartAt:
        alert.scheduleStartAt == null ? null : new Date(alert.scheduleStartAt),
    }),
    source: alert.source,
    threshold: alert.threshold,
    // Omitted for a non-range comparator; the repository clears the bound on
    // update (clearThresholdMax). Writing null instead would surface on the
    // create/update responses, which return the document directly, and a
    // client round-tripping one back into an update would fail validation.
    ...(isRangeThresholdType(alert.thresholdType) && {
      thresholdMax: alert.thresholdMax,
    }),
    thresholdType: alert.thresholdType,
    ...(userId && { createdBy: userId }),

    // Message template
    // Coerce undefined to null so the field is cleared on update.
    name: alert.name ?? null,
    message: alert.message ?? null,
    note: alert.note ?? null,

    displayName,
    tags,

    // Log alerts
    savedSearch: isSavedSearch ? (alert.savedSearchId ?? null) : null,
    groupBy: isSavedSearch ? (alert.groupBy ?? null) : null,
    // Tile alerts
    dashboard: isTile ? (alert.dashboardId ?? null) : null,
    tileId: isTile ? (alert.tileId ?? null) : null,

    // Inline alerts
    chartConfig: isInline ? (alert.chartConfig ?? null) : null,

    // Multi-window alerting
    numConsecutiveWindows: alert.numConsecutiveWindows ?? null,
  };
};

const clearsThresholdMax = (alertInput: AlertInput) => ({
  clearThresholdMax: !isRangeThresholdType(alertInput.thresholdType),
});

export const createAlert = async (
  teamId: string,
  alertInput: z.infer<typeof internalAlertSchema>,
  userId: string,
  refs: AlertRefs = {},
) => {
  const alert = await getMetadataStore().alerts.create(
    teamId,
    makeAlert(alertInput, userId, refs),
  );
  recordOnboardingTaskCompletion(userId, 'alert');
  return alert;
};

export const updateAlert = async (
  id: string,
  teamId: string,
  alertInput: AlertInput,
  refs: AlertRefs = {},
  userId?: string,
) => {
  const alert = await getMetadataStore().alerts.update(
    teamId,
    id,
    makeAlert(alertInput, undefined, refs),
    clearsThresholdMax(alertInput),
  );
  // Editing an alert also completes "set up an alert", not just creating one.
  if (alert != null) {
    recordOnboardingTaskCompletion(userId, 'alert');
  }
  return alert;
};

export const getAlertById = async (alertId: string, teamId: string) =>
  getMetadataStore().alerts.get(teamId, alertId);

export const getTeamDashboardAlertsByDashboardAndTile = async (
  teamId: string,
) => {
  const alerts = await getMetadataStore().alerts.findTileAlerts(teamId);
  return groupBy(alerts, a => `${a.dashboard}:${a.tileId}`);
};

export const getDashboardAlertsByTile = async (
  teamId: string,
  dashboardId: string,
) => {
  const alerts = await getMetadataStore().alerts.findByDashboard(teamId, {
    dashboard: dashboardId,
  });
  return groupBy(alerts, 'tileId');
};

export const createOrUpdateDashboardAlerts = async (
  dashboard: Pick<IDashboard, '_id' | 'name' | 'tags' | 'tiles'>,
  teamId: string,
  alertsByTile: Record<string, AlertInput>,
  userId?: string,
) => {
  const dashboardId: Id = dashboard._id;
  const alerts = getMetadataStore().alerts;
  const result = await Promise.all(
    Object.entries(alertsByTile).map(async ([tileId, alert]) => {
      const alertInput = {
        ...alert,
        source: AlertSource.TILE,
        dashboardId,
        tileId,
      };
      return alerts.upsertTile(
        teamId,
        { dashboard: dashboardId, tileId },
        makeAlert(alertInput, undefined, { dashboard }),
        { userId, ...clearsThresholdMax(alertInput) },
      );
    }),
  );

  // Tile alerts never hit the /alerts router, so record here.
  if (result.length > 0) {
    recordOnboardingTaskCompletion(userId, 'alert');
  }

  return result;
};

export const deleteDashboardAlerts = async (
  dashboardId: string,
  teamId: string,
  tileIds?: string[],
) => getMetadataStore().alerts.deleteByDashboard(teamId, dashboardId, tileIds);

/** Get alert, with the search or dashboard reference resolved */
export const getAlertWithDisplayRefs = async (
  alertId: string,
  teamId: string,
) => {
  const alert = await getMetadataStore().alerts.get(teamId, alertId);
  return alert ? (await hydrateAlertRefs(teamId, [alert]))[0] : null;
};

export const deleteAlert = async (id: string, teamId: string) =>
  getMetadataStore().alerts.delete(teamId, id);
