import { useMemo } from 'react';
import { UseFormSetValue, useWatch } from 'react-hook-form';
import { Separator } from '@clickhouse/click-ui';
import { tcFromSource } from '@couchbase-traces/common-utils/dist/core/metadata';
import { getAdhocFilterSourceKinds } from '@couchbase-traces/common-utils/dist/filters';
import { DashboardFilter } from '@couchbase-traces/common-utils/dist/types';
import { Box } from '@mantine/core';

import { CheckBoxControlled } from '@/components/InputControlled';
import SearchWhereInput from '@/components/SearchInput/SearchWhereInput';
import { SourceMultiSelectControlled } from '@/components/SourceMultiSelect';
import { useSources } from '@/source';

import { TOOLTIP_PORTAL_TARGET } from './constants';
import { CustomInputWrapper } from './CustomInputWrapper';
import { FilterFormControl, FilterFormValues } from './filterFormState';
import { VariableNameInput } from './VariableNameInput';

interface AdhocFilterEditFormProps {
  control: FilterFormControl;
  setValue: UseFormSetValue<FilterFormValues>;
  /** Filters other than the one being edited, used to keep variable names unique. */
  otherFilters: DashboardFilter[];
}

/** Form describing an ad hoc dashboard filter */
export const AdhocFilterEditForm = ({
  control,
  otherFilters,
}: AdhocFilterEditFormProps) => {
  const { data: allSources } = useSources();
  const [sourceType, isBroadcastEnabled, sourceIds] = useWatch({
    control,
    name: ['sourceType', 'isBroadcastEnabled', 'sources'],
  });
  const allowedSourceKinds = getAdhocFilterSourceKinds(sourceType);
  const tableConnections = useMemo(
    () =>
      (allSources ?? [])
        .filter(source => sourceIds?.includes(source.id))
        .map(tcFromSource),
    [allSources, sourceIds],
  );
  // The multi-selects hide sources of other kinds, which the form can still
  // hold after switching from another filter type.
  const validateSourceKinds = (ids: string[] | undefined) => {
    const hasOtherKind = ids?.some(id => {
      const source = allSources?.find(s => s.id === id);
      return source && !allowedSourceKinds.includes(source.kind);
    });
    return !hasOtherKind || 'Select only log, trace, or session sources';
  };

  return (
    <>
      <CustomInputWrapper
        label="Data sources"
        tooltipText="The sources whose keys and values the filter offers"
      >
        <SourceMultiSelectControlled
          control={control}
          name="sources"
          data-testid="adhoc-filter-sources"
          comboboxProps={{ withinPortal: true }}
          placeholder="Select sources"
          allowedSourceKinds={allowedSourceKinds}
          rules={{
            validate: (value: string[] | undefined) =>
              !value?.length
                ? 'Select at least one source'
                : validateSourceKinds(value),
          }}
        />
      </CustomInputWrapper>
      {sourceType === 'sql' && (
        <CustomInputWrapper
          label="Keys and values filter"
          tooltipText="Optional condition used to filter the rows from which keys and values are suggested. May reference the dashboard's other variables."
        >
          <SearchWhereInput
            tableConnections={tableConnections}
            control={control}
            name="where"
            languageName="whereLanguage"
            allowMultiline={true}
            sqlPlaceholder="Filter for keys and values"
            lucenePlaceholder="Filter for keys and values"
            enableVariables
            parentRef={TOOLTIP_PORTAL_TARGET}
          />
        </CustomInputWrapper>
      )}

      <Separator size="xs" />
      <CheckBoxControlled
        control={control}
        name="isBroadcastEnabled"
        size="xs"
        label="Broadcast filter conditions"
        description="Automatically apply the selected conditions to every tile based on the selected data sources. Optionally, specify which sources to broadcast to."
        data-testid="filter-broadcast-checkbox"
      />
      {isBroadcastEnabled && (
        <Box ml="xl">
          <CustomInputWrapper
            label="Applies to sources"
            tooltipText="Which tiles the broadcast reaches. Leave empty to broadcast to all tiles using the filter's data sources."
          >
            <SourceMultiSelectControlled
              control={control}
              name="appliesToSourceIds"
              data-testid="applies-to-source-selector"
              comboboxProps={{ withinPortal: true }}
              placeholder="Same as data sources"
              allowedSourceKinds={allowedSourceKinds}
              rules={{ validate: validateSourceKinds }}
            />
          </CustomInputWrapper>
        </Box>
      )}
      <Separator size="xs" />
      <VariableNameInput control={control} otherFilters={otherFilters} />
    </>
  );
};
