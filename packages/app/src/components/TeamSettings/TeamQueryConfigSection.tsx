import { useCallback, useState } from 'react';
import { SubmitHandler, useForm } from 'react-hook-form';
import { DEFAULT_METADATA_MAX_ROWS_TO_READ } from '@couchbase-traces/common-utils/dist/core/metadata';
import { type TeamQuerySettings } from '@couchbase-traces/common-utils/dist/types';
import {
  Box,
  Button,
  Card,
  Group,
  InputLabel,
  Stack,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconHelpCircle, IconPencil } from '@tabler/icons-react';

import api from '@/api';
import SelectControlled from '@/components/SelectControlled';
import { Separator } from '@/components/Separator/Separator';
import {
  DEFAULT_FILTER_KEYS_FETCH_LIMIT,
  DEFAULT_QUERY_TIMEOUT,
  DEFAULT_SEARCH_ROW_LIMIT,
} from '@/defaults';

type ClickhouseSettingType = 'number' | 'boolean' | 'select';

interface ClickhouseSettingFormProps {
  settingKey: keyof TeamQuerySettings;
  label: string;
  tooltip?: string;
  type: ClickhouseSettingType;
  defaultValue?: number | string;
  placeholder?: string;
  min?: number;
  max?: number;
  options?: { value: string; label: string }[];
  displayValue?: (value: any, defaultValue?: any) => string;
  description?: string;
}

function getFieldErrorMessage(error: unknown): string | undefined {
  return typeof error === 'object' &&
    error != null &&
    'message' in error &&
    typeof error.message === 'string'
    ? error.message
    : undefined;
}

function ClickhouseSettingForm({
  settingKey,
  label,
  tooltip,
  type,
  defaultValue,
  placeholder,
  min,
  max,
  options,
  displayValue,
  description,
}: ClickhouseSettingFormProps) {
  const { data: me, refetch: refetchMe } = api.useMe();
  const updateClickhouseSettings = api.useUpdateClickhouseSettings();
  const hasAdminAccess = true;
  const [isEditing, setIsEditing] = useState(false);
  const currentValue = me?.team[settingKey];

  const form = useForm<{ value: any }>({
    defaultValues: {
      value:
        type === 'boolean' && displayValue != null && currentValue != null
          ? displayValue(currentValue)
          : (currentValue ?? defaultValue ?? ''),
    },
  });

  const onSubmit: SubmitHandler<{ value: any }> = useCallback(
    async values => {
      try {
        const settingValue =
          type === 'boolean'
            ? values.value === displayValue?.(true)
            : type === 'select'
              ? values.value
              : Number(values.value);

        updateClickhouseSettings.mutate(
          { [settingKey]: settingValue },
          {
            onError: _e => {
              notifications.show({
                color: 'red',
                message: `Failed to update ${label}`,
              });
            },
            onSuccess: () => {
              notifications.show({
                color: 'green',
                message: `Updated ${label}`,
              });
              refetchMe();
              setIsEditing(false);
            },
          },
        );
      } catch (e) {
        notifications.show({
          color: 'red',
          message: e instanceof Error ? e.message : `Failed to update ${label}`,
        });
      }
    },
    [
      refetchMe,
      updateClickhouseSettings,
      settingKey,
      label,
      type,
      displayValue,
    ],
  );

  const handleReset = useCallback(() => {
    if (defaultValue == null) return;
    updateClickhouseSettings.mutate(
      { [settingKey]: null },
      {
        onError: () => {
          notifications.show({
            color: 'red',
            message: `Failed to reset ${label}`,
          });
        },
        onSuccess: () => {
          notifications.show({
            color: 'green',
            message: `Reset ${label} to default`,
          });
          form.reset({ value: defaultValue });
          refetchMe();
          setIsEditing(false);
        },
      },
    );
  }, [
    refetchMe,
    updateClickhouseSettings,
    settingKey,
    label,
    defaultValue,
    form,
  ]);

  const isCustomValue = currentValue !== undefined;

  return (
    <Stack gap="xs" mb="md">
      <Group gap="xs">
        <InputLabel size="md">{label}</InputLabel>
        {tooltip && (
          <Tooltip label={tooltip}>
            <Text size="sm" style={{ cursor: 'help' }}>
              <IconHelpCircle size={14} />
            </Text>
          </Tooltip>
        )}
      </Group>
      {description && (
        <Text size="xs" c="dimmed">
          {description}
        </Text>
      )}
      {isEditing && hasAdminAccess ? (
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Group>
            {type === 'select' && options ? (
              <SelectControlled
                control={form.control}
                name="value"
                data={options}
                size="xs"
                placeholder="Please select"
                withAsterisk
                miw={300}
                readOnly={!isEditing}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setIsEditing(false);
                  }
                }}
              />
            ) : type === 'boolean' && displayValue ? (
              <SelectControlled
                control={form.control}
                name="value"
                data={[displayValue(true), displayValue(false)]}
                size="xs"
                placeholder="Please select"
                withAsterisk
                miw={300}
                readOnly={!isEditing}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setIsEditing(false);
                  }
                }}
              />
            ) : (
              <TextInput
                size="xs"
                type="number"
                placeholder={
                  placeholder || currentValue?.toString() || `Enter value`
                }
                required
                readOnly={!isEditing}
                error={getFieldErrorMessage(form.formState.errors.value)}
                {...form.register('value', {
                  required: true,
                })}
                miw={300}
                min={min}
                max={max}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Escape') {
                    setIsEditing(false);
                  }
                }}
              />
            )}
            <Button
              type="submit"
              size="xs"
              variant="primary"
              loading={updateClickhouseSettings.isPending}
            >
              Save
            </Button>
            <Button
              type="button"
              size="xs"
              variant="secondary"
              disabled={updateClickhouseSettings.isPending}
              onClick={() => {
                setIsEditing(false);
              }}
            >
              Cancel
            </Button>
          </Group>
        </form>
      ) : (
        <Group>
          <Text className="text-white">
            {type === 'select'
              ? (options?.find(option => option.value === currentValue)
                  ?.label ??
                options?.find(option => option.value === defaultValue)?.label ??
                'Not set')
              : displayValue
                ? displayValue(currentValue, defaultValue)
                : currentValue?.toString() || 'Not set'}
          </Text>
          {hasAdminAccess && (
            <Button
              size="xs"
              variant="secondary"
              leftSection={<IconPencil size={16} />}
              onClick={() => setIsEditing(true)}
            >
              Change
            </Button>
          )}
          {hasAdminAccess && isCustomValue && defaultValue != null && (
            <Button
              size="xs"
              variant="subtle"
              loading={updateClickhouseSettings.isPending}
              onClick={handleReset}
            >
              Reset to default
            </Button>
          )}
        </Group>
      )}
    </Stack>
  );
}

const SCAN_CONSISTENCY_OPTIONS = [
  { value: 'not_bounded', label: 'Fast (not bounded)' },
  { value: 'request_plus', label: 'Consistent (request plus)' },
];

export default function TeamQueryConfigSection() {
  const displayValueWithUnit =
    (unit: string) => (value: any, defaultValue?: any) =>
      value === undefined || value === defaultValue
        ? `${defaultValue.toLocaleString()} ${unit}`
        : value === 0
          ? 'Unlimited'
          : `${value.toLocaleString()} ${unit}`;

  return (
    <Box id="team_query_config">
      <Text size="md">Query settings</Text>
      <Text size="sm" c="dimmed">
        Team defaults for queries. Each setting says which sources it applies
        to.
      </Text>
      <Separator size="lg" />
      <Card>
        <Stack>
          <ClickhouseSettingForm
            settingKey="searchRowLimit"
            label="Search Row Limit"
            tooltip="How many rows a search returns. Applies to all sources."
            type="number"
            defaultValue={DEFAULT_SEARCH_ROW_LIMIT}
            placeholder={`default = ${DEFAULT_SEARCH_ROW_LIMIT}, 0 = unlimited`}
            min={1}
            max={100000}
            displayValue={displayValueWithUnit('rows')}
          />
          <ClickhouseSettingForm
            settingKey="queryTimeout"
            label="Query Timeout (seconds)"
            tooltip="Applies to all sources."
            description="Applies to all sources."
            type="number"
            defaultValue={DEFAULT_QUERY_TIMEOUT}
            placeholder={`default = ${DEFAULT_QUERY_TIMEOUT}, 0 = unlimited`}
            min={0}
            displayValue={displayValueWithUnit('seconds')}
          />
          <ClickhouseSettingForm
            settingKey="metadataMaxRowsToRead"
            label="Max Rows to Read (METADATA ONLY)"
            tooltip="On Couchbase sources, the number of recent documents sampled to list fields and values."
            description="On Couchbase sources, the number of recent documents sampled to list fields and values."
            type="number"
            defaultValue={DEFAULT_METADATA_MAX_ROWS_TO_READ}
            placeholder={`default = ${DEFAULT_METADATA_MAX_ROWS_TO_READ.toLocaleString()}, 0 = unlimited`}
            min={0}
            displayValue={displayValueWithUnit('rows')}
          />
          <ClickhouseSettingForm
            settingKey="queryScanConsistency"
            label="Couchbase scan consistency"
            type="select"
            options={SCAN_CONSISTENCY_OPTIONS}
            defaultValue="not_bounded"
            tooltip="Consistent waits for indexes to include all writes made before the query; it is slower under heavy ingest."
            description="Consistent waits for indexes to include all writes made before the query; it is slower under heavy ingest."
          />
          <ClickhouseSettingForm
            settingKey="queryMaxParallelism"
            label="Couchbase max parallelism"
            type="number"
            min={1}
            max={64}
            placeholder="Server default"
            tooltip="Upper bound on parallel execution per query. The server's own limit still applies."
            description="Upper bound on parallel execution per query. The server's own limit still applies."
          />
          <ClickhouseSettingForm
            settingKey="filterKeysFetchLimit"
            label="Filter Keys Fetch Limit"
            tooltip="How many field names to list per attribute map. Applies to all sources."
            type="number"
            defaultValue={DEFAULT_FILTER_KEYS_FETCH_LIMIT}
            placeholder={`default = ${DEFAULT_FILTER_KEYS_FETCH_LIMIT}`}
            min={1}
            max={1000}
            displayValue={displayValueWithUnit('keys')}
            description={`Default is ${DEFAULT_FILTER_KEYS_FETCH_LIMIT}`}
          />
          <ClickhouseSettingForm
            settingKey="fieldMetadataDisabled"
            label="Field Metadata Queries"
            tooltip="When disabled, field lists are not loaded. Applies to all sources."
            type="boolean"
            displayValue={value => (value ? 'Disabled' : 'Enabled')}
          />
          <ClickhouseSettingForm
            settingKey="parallelizeWhenPossible"
            label="Parallelize Queries When Possible"
            tooltip="Runs independent parts of a query at the same time. Applies to all sources."
            type="boolean"
            displayValue={value => (value ? 'Enabled' : 'Disabled')}
          />
        </Stack>
      </Card>
    </Box>
  );
}
