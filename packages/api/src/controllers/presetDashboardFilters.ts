import {
  PresetDashboard,
  PresetDashboardFilter,
} from '@couchbase-traces/common-utils/dist/types';

import { getMetadataStore } from '@/metadata';

type IdLike = string | { toString(): string };

export async function getPresetDashboardFilters(
  teamId: IdLike,
  source: IdLike,
  presetDashboard: PresetDashboard,
) {
  return getMetadataStore().presetDashboardFilters.listFor(
    teamId.toString(),
    source.toString(),
    presetDashboard,
  );
}

export const createPresetDashboardFilter = async (
  teamId: IdLike,
  presetDashboardFilter: PresetDashboardFilter,
) => {
  const { id: _id, ...input } = presetDashboardFilter;
  return getMetadataStore().presetDashboardFilters.create(
    teamId.toString(),
    input,
  );
};

export const updatePresetDashboardFilter = async (
  teamId: IdLike,
  presetDashboardFilter: PresetDashboardFilter,
) => {
  const { id, ...input } = presetDashboardFilter;
  return getMetadataStore().presetDashboardFilters.update(
    teamId.toString(),
    id,
    input,
  );
};

export const deletePresetDashboardFilter = async (
  teamId: IdLike,
  presetDashboard: PresetDashboard,
  presetDashboardFilterId: IdLike,
) => {
  return getMetadataStore().presetDashboardFilters.deleteFor(
    teamId.toString(),
    presetDashboard,
    presetDashboardFilterId.toString(),
  );
};
