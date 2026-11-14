import {
  BuilderSavedChartConfig,
  RawSqlSavedChartConfig,
} from '@couchbase-traces/common-utils/dist/types';

import { AlertWithCreatedBy } from '@/types';

export type SavedChartConfigWithSelectArray = Omit<
  BuilderSavedChartConfig,
  'select'
> & {
  select: NonNullable<Exclude<BuilderSavedChartConfig['select'], string>>;
};

/**
 * Flattened editor form state for builder and raw SQL chart configs.
 * `series` mirrors `select` as an array for useFieldArray.
 */
export type ChartEditorFormState = Partial<
  Omit<BuilderSavedChartConfig, 'heatmap'>
> &
  Partial<Omit<RawSqlSavedChartConfig, 'configType'>> & {
    heatmap?: BuilderSavedChartConfig['heatmap'];
    alert?: BuilderSavedChartConfig['alert'] & {
      id?: string;
      createdBy?: AlertWithCreatedBy['createdBy'];
    };
    series: SavedChartConfigWithSelectArray['select'];
    configType?: 'sql' | 'builder';
  };
