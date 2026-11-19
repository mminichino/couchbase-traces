import { SourceSchemaNoId } from '@couchbase-traces/common-utils/dist/types';

import { getMetadataStore } from '@/metadata';
import type { SourceInput } from '@/metadata/schemas/source';

export function getSources(team: string) {
  return getMetadataStore().sources.list(team);
}

/** Null for a malformed id as well as a missing source. */
export function getSource(team: string, sourceId: string) {
  return getMetadataStore().sources.get(team, sourceId);
}

export function createSource(team: string, source: SourceInput) {
  return getMetadataStore().sources.create(team, source);
}

/**
 * Swaps the whole source, keeping `_id`, `team`, and `createdAt`. A kind
 * change is the one path validated through Zod here (callers identify the
 * source by `sourceId`, so any id in the body is ignored); it throws
 * `Invalid source data: …` like the Mongoose version did.
 */
export async function updateSource(
  team: string,
  sourceId: string,
  source: SourceInput,
) {
  const store = getMetadataStore();
  const existing = await store.sources.get(team, sourceId);
  if (!existing) return null;
  if (existing.kind !== source.kind) {
    const parsed = SourceSchemaNoId.safeParse(source);
    if (!parsed.success) {
      throw new Error(
        `Invalid source data: ${parsed.error.errors.map(e => e.message).join(', ')}`,
      );
    }
  }
  return store.sources.replace(team, sourceId, source);
}

export function deleteSource(team: string, sourceId: string) {
  return getMetadataStore().sources.delete(team, sourceId);
}
