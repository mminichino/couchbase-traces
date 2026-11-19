import type { PresetDashboard } from '@couchbase-traces/common-utils/dist/types';

import type { Id } from '@/metadata/ids';
import { type RepoDeps } from '@/metadata/repos/docs';
import { definedOnly, TeamDocs } from '@/metadata/repos/teamDocs';
import { toDate } from '@/metadata/schemas/common';
import {
  type IPresetDashboardFilter,
  type PresetDashboardFilterDoc,
  PresetDashboardFilterDocSchema,
  type PresetDashboardFilterInput,
} from '@/metadata/schemas/presetDashboardFilter';

function toPreset(id: Id, d: PresetDashboardFilterDoc): IPresetDashboardFilter {
  return {
    ...d,
    _id: id,
    id,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  };
}

/** `preset_dashboard_filters/<id>`. */
export class PresetDashboardFilterRepository extends TeamDocs<
  PresetDashboardFilterDoc,
  IPresetDashboardFilter
> {
  constructor(deps: RepoDeps) {
    super(
      deps,
      'preset_dashboard_filters',
      PresetDashboardFilterDocSchema,
      toPreset,
    );
  }

  listFor(
    team: Id,
    source: Id,
    presetDashboard: PresetDashboard,
  ): Promise<IPresetDashboardFilter[]> {
    return this.list(team, { source: source.toLowerCase(), presetDashboard });
  }

  create(
    team: Id,
    input: PresetDashboardFilterInput,
  ): Promise<IPresetDashboardFilter> {
    return this.insertDoc(
      this.fresh({ ...input, team, source: input.source.toLowerCase() }),
    );
  }

  /** `$set` of the given fields; null when the filter is absent or foreign. */
  async update(
    team: Id,
    id: Id,
    input: PresetDashboardFilterInput,
  ): Promise<IPresetDashboardFilter | null> {
    const r = await this.mutate(team, id, cur => ({
      ...cur,
      ...definedOnly(input),
      source: input.source.toLowerCase(),
    }));
    return r ? toPreset(r.id, r.after) : null;
  }

  /** Deletes only when the filter belongs to `presetDashboard`. */
  async deleteFor(
    team: Id,
    presetDashboard: PresetDashboard,
    id: Id,
  ): Promise<IPresetDashboardFilter | null> {
    const cur = await this.get(team, id);
    if (!cur || cur.presetDashboard !== presetDashboard) return null;
    return this.delete(team, id);
  }
}
