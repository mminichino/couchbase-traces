import { MAX_ALERT_DISPLAY_NAME_LENGTH } from '@couchbase-traces/common-utils/dist/types';
import { z } from 'zod';

import { hydrateAlertRefs } from '@/controllers/alertRefs';
import { getMetadataStore } from '@/metadata';
import type { AlertsCursor, AlertsPageFilter } from '@/metadata/repos/alerts';
import { AlertSource, AlertState, type IAlert } from '@/metadata/schemas/alert';
import { decodeCursor, encodeCursor } from '@/utils/pagination';
import { idSchema, stringListQueryParam, tagsSchema } from '@/utils/zod';

const MAX_PAGE_LIMIT = 500;

/** States an alert document can hold; ERROR only appears on history records. */
const ALERT_FILTER_STATES = [
  AlertState.ALERT,
  AlertState.DISABLED,
  AlertState.INSUFFICIENT_DATA,
  AlertState.OK,
  AlertState.PENDING,
] as const;

/** The page cursor's payload: the sort key of the last item on the page. */
const alertsPageCursorSchema = z.object({
  n: z.string().nullable(),
  id: idSchema,
});

/** Filter parameters shared by the internal alerts page and the v2 list endpoint. */
export const alertsFilterShape = {
  /** A list of tags to filter alerts by. Returns alerts that have any of the specified tags */
  tag: stringListQueryParam.pipe(tagsSchema).optional(),
  /** A list of alert sources to filter by. Returns alerts that match any of the specified sources */
  source: stringListQueryParam
    .pipe(
      z
        .array(z.nativeEnum(AlertSource))
        .optional()
        .transform(v => v && [...new Set(v)]),
    )
    .optional(),
  /** A list of alert states to filter by. Returns alerts that match any of the specified states */
  state: stringListQueryParam
    .pipe(
      z
        .array(z.enum(ALERT_FILTER_STATES))
        .optional()
        .transform(v => v && [...new Set(v)]),
    )
    .optional(),
  /** A search string to filter alerts by their display name. Substring, case-insensitive match */
  search: z.string().trim().max(MAX_ALERT_DISPLAY_NAME_LENGTH).optional(),
};

export type AlertsFilterParams = z.infer<z.ZodObject<typeof alertsFilterShape>>;

/** Query parameters schema for the list alerts endpoint. */
export const alertsPageQuerySchema = z
  .object({
    /** Number of alerts to return in one page. Omitted means no paging is applied */
    limit: z.coerce.number().int().min(1).max(MAX_PAGE_LIMIT).optional(),
    /** The cursor pointing to the last item of the previous page, if there was a previous page */
    cursor: z.string().optional(),
    /** A user ID, to filter for alerts created by a specific user */
    createdBy: idSchema.optional(),
    ...alertsFilterShape,
  })
  .superRefine((query, ctx) => {
    if (query.cursor == null) {
      return;
    }
    // A cursor implies pagination, which requires a limit
    if (query.limit == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['cursor'],
        message: 'cursor requires limit',
      });
    }
    if (decodeCursor(query.cursor, alertsPageCursorSchema) == null) {
      ctx.addIssue({
        code: 'custom',
        path: ['cursor'],
        message: 'invalid cursor',
      });
    }
  });

export type AlertsPageParams = z.infer<typeof alertsPageQuerySchema>;

/**
 * Repository filter for the shared filter parameters. A missing state counts
 * as OK and a missing source as saved-search (the schema defaults); the
 * query layer applies both.
 */
export function buildAlertsFilter(
  params: AlertsFilterParams,
): AlertsPageFilter {
  return {
    ...(params.tag != null && { tags: params.tag }),
    ...(params.state != null && { states: params.state }),
    ...(params.source != null && { sources: params.source }),
    ...(params.search && { search: params.search }),
  };
}

/** Filter plus keyset position for a single page. */
export function buildAlertsPageFilter(params: AlertsPageParams): {
  filter: AlertsPageFilter;
  after?: AlertsCursor;
} {
  const filter: AlertsPageFilter = {
    ...buildAlertsFilter(params),
    ...(params.createdBy != null && { createdBy: params.createdBy }),
  };
  const cursor = params.cursor
    ? decodeCursor(params.cursor, alertsPageCursorSchema)
    : null;
  return cursor == null
    ? { filter }
    : { filter, after: { name: cursor.n, id: cursor.id } };
}

export async function getAlertsPage(teamId: string, params: AlertsPageParams) {
  const { limit } = params;
  const { filter, after } = buildAlertsPageFilter(params);
  // One row past the page answers "is there more?" without a second count
  // query. Omitting limit keeps the legacy unpaginated response.
  const { items, hasMore } = await getMetadataStore().alerts.page(
    teamId,
    filter,
    { after, limit },
  );
  const data = await hydrateAlertRefs(teamId, items);
  const last = data.at(-1);
  const nextCursor =
    hasMore && last != null
      ? encodeCursor({ n: last.displayName ?? null, id: last._id })
      : undefined;

  return { data, hasMore, nextCursor };
}

/** Rows fetched per keyset step when draining a filtered list. */
const DRAIN_PAGE_SIZE = 500;

/**
 * Offset/limit window over the filtered alerts in id order (the v2 list), with
 * the total match count. Drains the keyset pages rather than paging by offset.
 */
export async function listAlertsWindow(
  teamId: string,
  params: AlertsFilterParams,
  { limit, offset }: { limit: number; offset: number },
) {
  const alerts = getMetadataStore().alerts;
  const filter = buildAlertsFilter(params);
  const all: IAlert[] = [];
  let after: AlertsCursor | undefined;
  for (;;) {
    const page = await alerts.page(teamId, filter, {
      after,
      limit: DRAIN_PAGE_SIZE,
    });
    all.push(...page.items);
    const last = page.items.at(-1);
    if (!page.hasMore || last == null) break;
    after = { name: last.displayName ?? null, id: last._id };
  }
  all.sort((a, b) => a._id.localeCompare(b._id));
  return {
    total: all.length,
    data: await hydrateAlertRefs(teamId, all.slice(offset, offset + limit)),
  };
}
