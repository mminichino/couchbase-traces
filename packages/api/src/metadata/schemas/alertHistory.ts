import {
  AlertErrorType,
  AlertHistoryAnalyticsSchema,
  type AlertNotificationTargetTiming,
} from '@couchbase-traces/common-utils/dist/types';
import { z } from 'zod';

import type { Id } from '@/metadata/ids';
import { IsoDate } from '@/metadata/schemas/common';

import { AlertState, type IAlertError } from './alert';

/**
 * Diagnostics for the evaluation that wrote a history record.
 * Evaluation-level: identical on every row one evaluation writes (including
 * per-group rows).
 */
export interface IAlertHistoryAnalytics {
  /**
   * SQL query duration for the evaluation (ms). On query-failure
   * ERROR records, the time until the query failed — for QUERY_TIMEOUT this
   * is approximately the configured evaluation timeout.
   */
  queryDurationMs?: number;
  /** Wall time delivering the evaluation's notifications (ms) — dispatch only, including retries. */
  webhookDurationMs?: number;
  /**
   * Earlier buckets backfilled in this run after missed ticks
   * (expected buckets − 1). 0 in steady state.
   */
  backfilledBuckets?: number;
  /** Per-target breakdown, slowest first. See AlertHistoryAnalyticsSchema for why these do not sum to the total. */
  notificationTargets?: AlertNotificationTargetTiming[];
}

/** One group-by column and its value, stored as a pair. */
export type GroupValue = { key: string; value: string };

export const attributesToGroupValues = (
  attributes: Record<string, string>,
): GroupValue[] | undefined => {
  const entries = Object.entries(attributes);
  return entries.length > 0
    ? entries.map(([key, value]) => ({ key, value }))
    : undefined;
};

export const groupValuesToAttributes = (
  groupValues: GroupValue[] | null | undefined,
): Record<string, string> | undefined =>
  groupValues?.length
    ? Object.fromEntries(groupValues.map(v => [v.key, v.value]))
    : undefined;

export interface IAlertHistory {
  alert: Id;
  counts: number;
  createdAt: Date;
  state: AlertState;
  lastValues: { startTime: Date; count: number }[];
  group?: string; // For group-by alerts, stores the group identifier
  fired?: boolean;
  /**
   * Group-by values of a group-by alert's group. Kept so a group that later
   * vanishes from the data still resolves with its values, which the joined
   * `group` string cannot be parsed back into. Stored as pairs because column
   * names may contain dots.
   */
  groupValues?: GroupValue[];
  /**
   * Errors recorded for this evaluation window. Present on ERROR-state rows
   * (query/processing failures where no normal history is written) and on
   * the ERROR row created alongside normal rows when notifications fail.
   */
  errors?: IAlertError[];
  /** Diagnostics for the evaluation that wrote this record. */
  analytics?: IAlertHistoryAnalytics;
}

const ErrorDocSchema = z.object({
  timestamp: IsoDate,
  type: z.nativeEnum(AlertErrorType),
  message: z.string(),
});

/** `alert_history/<id>`; ERROR rows use the key `err::<alertId>::<windowMs>`. */
export const AlertHistoryDocSchema = z.object({
  alert: z.string(),
  counts: z.number().default(0),
  createdAt: IsoDate,
  state: z.nativeEnum(AlertState),
  lastValues: z.array(z.object({ startTime: IsoDate, count: z.number() })),
  group: z.string().optional(),
  fired: z.boolean().optional(),
  groupValues: z
    .array(z.object({ key: z.string(), value: z.string() }))
    .optional(),
  errors: z.array(ErrorDocSchema).optional(),
  analytics: AlertHistoryAnalyticsSchema.optional(),
});

export type AlertHistoryDoc = z.infer<typeof AlertHistoryDocSchema>;

/** The latest row per group, or a row in a consecutive-window range. */
export interface AggregatedAlertHistory {
  _id: Id;
  createdAt: Date;
  state: AlertState;
  group?: string;
  fired?: boolean;
  groupValues?: GroupValue[] | null;
}

/** One evaluation window: every row sharing a `createdAt`. */
export type GroupedAlertHistory = {
  createdAt: Date;
  states: AlertState[];
  counts: number;
  lastValues: IAlertHistory['lastValues'][];
  errors: IAlertError[][];
};

export type EvaluationWindowRow = {
  group?: string;
  state: AlertState;
  counts?: number;
  lastValues?: IAlertHistory['lastValues'];
  fired?: boolean;
  errors?: IAlertError[];
  analytics?: IAlertHistoryAnalytics;
};

export type StructuredWindow = {
  createdAt: Date;
  rows: EvaluationWindowRow[];
};

export type TransitionWindow = {
  createdAt: Date;
  states: AlertState[];
  /** One array of bucket starts per row in the window. */
  bucketStarts: Date[][];
};

export type DateRange = {
  gte?: Date;
  gt?: Date;
  lte?: Date;
  lt?: Date;
};

/** 30 days, the history retention (collection maxTTL is the backstop). */
export const ALERT_HISTORY_TTL_MS = 30 * 24 * 60 * 60 * 1000;
