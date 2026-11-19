import mongoose from 'mongoose';

import { getMetadataStore } from '@/metadata';
import type { IDashboard } from '@/metadata/schemas/dashboard';
import Alert, { IAlert } from '@/models/alert';
import { deriveAlertDisplayFields } from '@/utils/alerts';
import logger from '@/utils/logger';

const BACKFILL_BATCH_SIZE = 500;

const DISPLAY_NAME_MISSING_FILTER = { displayName: { $in: [null, ''] } };
// Matches missing/null only; a stored [] is already resolved and left alone.
const TAGS_MISSING_FILTER = { tags: null };

export async function backfillAlertDisplayFields() {
  const ids = (
    await Alert.find(
      { $or: [DISPLAY_NAME_MISSING_FILTER, TAGS_MISSING_FILTER] },
      { _id: 1 },
    ).lean()
  ).map(doc => doc._id);
  if (ids.length === 0) {
    return;
  }

  let updatedCount = 0;
  for (let i = 0; i < ids.length; i += BACKFILL_BATCH_SIZE) {
    const batch = await Alert.find(
      { _id: { $in: ids.slice(i, i + BACKFILL_BATCH_SIZE) } },
      {
        team: 1,
        displayName: 1,
        tags: 1,
        source: 1,
        savedSearch: 1,
        dashboard: 1,
        tileId: 1,
        'chartConfig.name': 1,
      },
    ).lean();

    // Saved searches and dashboards live in the metadata store, which is
    // team-scoped, so the lookups run once per team in the batch.
    const store = getMetadataStore();
    const savedSearchById = new Map<string, { name: string; tags: string[] }>();
    const dashboardById = new Map<string, IDashboard>();
    const teams = new Set(batch.map(a => String(a.team)));
    for (const team of teams) {
      const mine = batch.filter(a => String(a.team) === team);
      const ids = (pick: (a: (typeof batch)[number]) => unknown) => [
        ...new Set(
          mine
            .map(pick)
            .filter(id => id != null)
            .map(String),
        ),
      ];
      const [searches, dashboards] = await Promise.all([
        store.savedSearches.getMany(
          team,
          ids(a => a.savedSearch),
        ),
        store.dashboards.getMany(
          team,
          ids(a => a.dashboard),
        ),
      ]);
      searches.forEach((v, k) => savedSearchById.set(k, v));
      dashboards.forEach((v, k) => dashboardById.set(k, v));
    }

    const ops: {
      filter: mongoose.FilterQuery<IAlert>;
      update: { $set: { displayName: string } | { tags: string[] } };
    }[] = [];
    for (const alert of batch) {
      const derived = deriveAlertDisplayFields(alert, {
        savedSearch:
          alert.savedSearch != null
            ? savedSearchById.get(String(alert.savedSearch))
            : undefined,
        dashboard:
          alert.dashboard != null
            ? dashboardById.get(String(alert.dashboard))
            : undefined,
      });
      const hasDisplayName =
        typeof alert.displayName === 'string' && alert.displayName !== '';
      const hasTags = alert.tags != null;

      const inputsUnchangedFilter = {
        source: alert.source ?? null,
        savedSearch: alert.savedSearch ?? null,
        dashboard: alert.dashboard ?? null,
        tileId: alert.tileId ?? null,
        'chartConfig.name': alert.chartConfig?.name ?? null,
      };
      if (!hasDisplayName && derived.displayName != null) {
        ops.push({
          filter: {
            _id: alert._id,
            ...inputsUnchangedFilter,
            ...DISPLAY_NAME_MISSING_FILTER,
          },
          update: { $set: { displayName: derived.displayName } },
        });
      }

      if (!hasTags && derived.tags != null) {
        ops.push({
          filter: {
            _id: alert._id,
            ...inputsUnchangedFilter,
            ...TAGS_MISSING_FILTER,
          },
          update: { $set: { tags: derived.tags } },
        });
      }
    }

    if (ops.length > 0) {
      // Per-op timestamps because the bulkWrite-level option only covers
      // inserts; without it the backfill bumps the user-visible updatedAt.
      const result = await Alert.bulkWrite(
        ops.map(op => ({ updateOne: { ...op, timestamps: false } })),
        { ordered: false },
      );
      updatedCount += result.modifiedCount;
    }
  }

  logger.info(
    { scannedCount: ids.length, updatedCount },
    'Backfilled alert display names and tags',
  );
}

export async function runStartupMigrations() {
  try {
    await backfillAlertDisplayFields();
  } catch (e) {
    logger.error({ err: e }, 'Error backfilling alert display names and tags');
  }
}
