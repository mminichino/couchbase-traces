import {
  ALERT_INTERVAL_TO_MINUTES,
  type AlertChartConfig,
  AlertErrorType,
  AlertThresholdType,
} from '@couchbase-traces/common-utils/dist/types';
import { z } from 'zod';

import type { Id } from '@/metadata/ids';
import { IsoDate } from '@/metadata/schemas/common';

export { AlertThresholdType };

export enum AlertState {
  ALERT = 'ALERT',
  DISABLED = 'DISABLED',
  /**
   * Only used on AlertHistory records (never on the alert itself): marks an
   * evaluation window whose evaluation or notification failed. ERROR history
   * rows are excluded from alert scheduling/backfill computations so the
   * failed window is still retried.
   */
  ERROR = 'ERROR',
  INSUFFICIENT_DATA = 'INSUFFICIENT_DATA',
  OK = 'OK',
  PENDING = 'PENDING',
}

export enum AlertSource {
  SAVED_SEARCH = 'saved_search',
  TILE = 'tile',
  /** Detached alert whose chart config lives inline on the alert (no saved search/tile). */
  INLINE = 'inline',
}

export interface IAlertError {
  timestamp: Date;
  type: AlertErrorType;
  message: string;
}

// follow 'ms' pkg formats
export type AlertInterval =
  | '1m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '6h'
  | '12h'
  | '1d';

export type AlertChannel =
  | {
      type: 'webhook';
      webhookId: string;
    }
  | {
      type: null;
    };

/**
 * Resolve an alert's notification channels regardless of document vintage:
 * documents written before multi-channel support only have the singular
 * `channel`. Writers keep `channel` mirrored to `channels[0]`.
 */
export const getAlertChannels = (alert: {
  channel?: AlertChannel | null;
  channels?: AlertChannel[] | null;
}): AlertChannel[] => {
  if (alert.channels != null && alert.channels.length > 0) {
    return alert.channels;
  }
  if (alert.channel != null && alert.channel.type != null) {
    return [alert.channel];
  }
  return [];
};

/** An alert as services see it: string ids, `Date` instants. */
export interface IAlert {
  _id: Id;
  id: Id;
  channel: AlertChannel;
  channels?: AlertChannel[];
  interval: AlertInterval;
  scheduleOffsetMinutes?: number;
  scheduleStartAt?: Date | null;
  source?: AlertSource;
  state: AlertState;
  team: Id;
  threshold: number;
  /** The upper bound for BETWEEN and NOT BETWEEN threshold types */
  thresholdMax?: number;
  thresholdType: AlertThresholdType;
  createdBy?: Id;

  // Message template (handlebars)
  name?: string | null;
  message?: string | null;

  // Freeform note (supports markdown)
  note?: string | null;

  // User-facing name shown in the alerts list and notification titles (when not overridden by name template).
  // Unset means "derive from the referenced saved search / dashboard tile".
  displayName?: string | null;
  // Unset (not []) means "derive from the referenced entity".
  tags?: string[] | null;

  // SavedSearch alerts
  groupBy?: string | null;
  savedSearch?: Id | null;

  // Tile alerts
  dashboard?: Id | null;
  tileId?: string | null;

  // Inline alerts: the persisted chart config (same shape as a dashboard
  // tile's config, minus the embedded alert field)
  chartConfig?: AlertChartConfig | null;

  silenced?: {
    by?: Id;
    at: Date;
    until: Date;
  };

  // Multi-window alerting: fire only after N violations in M consecutive windows
  numConsecutiveWindows?: number | null;

  // Errors recorded during the most recent execution
  executionErrors?: IAlertError[];
  createdAt: Date;
  updatedAt: Date;
}

const ErrorDocSchema = z.object({
  timestamp: IsoDate,
  type: z.nativeEnum(AlertErrorType),
  message: z.string(),
});

/**
 * `alerts/<id>`. Lenient on the Mixed fields (`channel`, `channels`,
 * `chartConfig`), which the API layer validates on write. `state` and `source`
 * keep the defaults Mongoose applied. Optional fields the controllers clear
 * are stored as `null`, which the response shape has always carried.
 */
export const AlertDocSchema = z.object({
  team: z.string(),
  threshold: z.number(),
  thresholdMax: z.number().nullish(),
  thresholdType: z.nativeEnum(AlertThresholdType).optional(),
  interval: z.string(),
  scheduleOffsetMinutes: z.number().optional(),
  scheduleStartAt: IsoDate.nullish(),
  channel: z.unknown().optional(),
  channels: z.array(z.unknown()).optional(),
  state: z.nativeEnum(AlertState).default(AlertState.OK),
  source: z.nativeEnum(AlertSource).default(AlertSource.SAVED_SEARCH),
  createdBy: z.string().nullish(),
  name: z.string().nullish(),
  message: z.string().nullish(),
  note: z.string().nullish(),
  displayName: z.string().nullish(),
  tags: z.array(z.string()).nullish(),
  savedSearch: z.string().nullish(),
  groupBy: z.string().nullish(),
  dashboard: z.string().nullish(),
  tileId: z.string().nullish(),
  chartConfig: z.unknown().optional(),
  numConsecutiveWindows: z.number().nullish(),
  silenced: z
    .object({
      by: z.string().optional(),
      at: IsoDate,
      until: IsoDate,
    })
    .optional(),
  executionErrors: z.array(ErrorDocSchema).optional(),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});

export type AlertDoc = z.infer<typeof AlertDocSchema>;

/** What the controllers build for a create/update (the old `makeAlert` output). */
export type AlertFields = Partial<
  Omit<
    IAlert,
    | '_id'
    | 'id'
    | 'team'
    | 'createdAt'
    | 'updatedAt'
    | 'state'
    | 'silenced'
    | 'executionErrors'
  >
>;

export type AlertInputDoc = AlertFields & {
  channel: AlertChannel;
  interval: AlertInterval;
  threshold: number;
  thresholdType: AlertThresholdType;
};

/**
 * The write rules Mongoose enforced on the alert schema, with its messages.
 * Null when the fields are acceptable.
 */
export function alertFieldsViolation(f: {
  interval?: string;
  scheduleOffsetMinutes?: number | null;
  numConsecutiveWindows?: number | null;
}): string | null {
  const offset = f.scheduleOffsetMinutes;
  if (offset != null) {
    // Maximum offset for daily windows (24h - 1 minute).
    if (offset < 0 || offset > 1439) {
      return 'scheduleOffsetMinutes must be between 0 and 1439';
    }
    const minutes =
      f.interval != null
        ? new Map<string, number>(
            Object.entries(ALERT_INTERVAL_TO_MINUTES),
          ).get(f.interval)
        : undefined;
    if (minutes != null && offset >= minutes) {
      return 'scheduleOffsetMinutes must be less than the alert interval in minutes';
    }
  }
  if (f.numConsecutiveWindows != null && f.numConsecutiveWindows < 1) {
    return 'numConsecutiveWindows must be at least 1';
  }
  return null;
}
