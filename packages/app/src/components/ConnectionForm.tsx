import { useCallback, useState } from 'react';
import { omit } from 'lodash';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { testLocalConnection } from '@couchbase-traces/common-utils/dist/clickhouse/browser';
import {
  Connection,
  ConnectionKind,
} from '@couchbase-traces/common-utils/dist/types';
import {
  Anchor,
  Box,
  Button,
  Flex,
  Group,
  SegmentedControl,
  Stack,
  Switch,
  Text,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconHelpCircle, IconSettings } from '@tabler/icons-react';

import api from '@/api';
import {
  type ConnectionFormValues,
  CouchbaseConnectionFields,
} from '@/components/CouchbaseConnectionFields';
import {
  InputControlled,
  PasswordInputControlled,
  TextInputControlled,
} from '@/components/InputControlled';
import {
  IS_CLICKHOUSE_BUILD,
  IS_LOCAL_MODE,
  IS_PROMQL_ENABLED,
} from '@/config';
import {
  testConnectionByKind,
  useCreateConnection,
  useDeleteConnection,
  useUpdateConnection,
} from '@/connection';
import { stripTrailingSlash } from '@/utils';

import ConfirmDeleteMenu from './ConfirmDeleteMenu';

enum TestConnectionState {
  Loading = 'loading',
  Valid = 'valid',
  Invalid = 'invalid',
}

const KIND_LABELS: Record<ConnectionKind, string> = {
  clickhouse: 'ClickHouse',
  couchbase: 'Couchbase',
};

function useTestConnection({
  getValues,
  connectionId,
  isNew,
}: {
  getValues: () => ConnectionFormValues;
  connectionId: string;
  isNew: boolean;
}) {
  const testClickHouseConnection = api.useTestConnection();
  const [testConnectionState, setTestConnectionState] =
    useState<TestConnectionState | null>(null);

  const handleTestConnection = useCallback(async () => {
    const values = getValues();
    const { username } = values;
    const password = values.password ?? '';
    const host =
      values.kind === 'couchbase'
        ? values.host.trim()
        : stripTrailingSlash(values.host);

    if (testConnectionState) {
      return;
    }

    setTestConnectionState(TestConnectionState.Loading);

    if (IS_LOCAL_MODE) {
      try {
        const result = await testLocalConnection({ host, username, password });
        if (result) {
          setTestConnectionState(TestConnectionState.Valid);
        } else {
          setTestConnectionState(TestConnectionState.Invalid);
          notifications.show({
            color: 'red',
            message: 'Connection test failed',
            autoClose: 5000,
          });
        }
      } catch (e) {
        console.error(e);
        setTestConnectionState(TestConnectionState.Invalid);
        notifications.show({
          color: 'red',
          message: e.message,
          autoClose: 5000,
        });
      }
    } else {
      try {
        const result =
          values.kind === 'couchbase'
            ? await testConnectionByKind({
                kind: 'couchbase',
                host,
                username,
                // Blank secrets on edit reuse the stored ones.
                password: password || undefined,
                wanProfile: values.wanProfile,
                tlsCaCertificate: values.tlsCaCertificate || undefined,
                connectionId: isNew ? undefined : connectionId,
              })
            : await testClickHouseConnection.mutateAsync({
                host,
                username,
                password,
              });
        if (result.success) {
          setTestConnectionState(TestConnectionState.Valid);
        } else {
          setTestConnectionState(TestConnectionState.Invalid);
          notifications.show({
            color: 'red',
            message: result.error || 'Connection test failed',
            autoClose: 5000,
          });
        }
      } catch (error: any) {
        const body = await error.response?.json();
        setTestConnectionState(TestConnectionState.Invalid);
        notifications.show({
          color: 'red',
          message: body?.error ?? 'Failed to test connection',
          autoClose: 5000,
        });
      }
    }

    setTimeout(() => {
      setTestConnectionState(null);
    }, 2000);
  }, [
    getValues,
    testConnectionState,
    connectionId,
    isNew,
    testClickHouseConnection,
  ]);

  return {
    testConnectionState,
    handleTestConnection,
  };
}

export function ConnectionForm({
  connection,
  isNew,
  onSave,
  onClose,
  showCancelButton = false,
  showDeleteButton = false,
}: {
  connection: Connection;
  isNew: boolean;
  onSave?: () => void;
  onClose?: () => void;
  showCancelButton?: boolean;
  showDeleteButton?: boolean;
}) {
  const {
    control,
    handleSubmit,
    resetField,
    getValues,
    setValue,
    formState,
    trigger,
  } = useForm<ConnectionFormValues>({
    defaultValues: {
      id: connection.id,
      name: connection.name,
      kind: connection.kind ?? 'clickhouse',
      host: connection.host ?? '',
      username: connection.username,
      password: connection.password,
      ...(connection.kind === 'couchbase'
        ? {
            wanProfile:
              connection.wanProfile ??
              /^couchbases:\/\//i.test(connection.host ?? ''),
            monitorUsername: connection.monitorUsername ?? '',
            managementPort:
              connection.managementPort == null
                ? ''
                : String(connection.managementPort),
          }
        : {
            hyperdxSettingPrefix: connection.hyperdxSettingPrefix,
            isPrometheusEndpoint: connection.isPrometheusEndpoint,
          }),
    },
  });

  const watchedHost = useWatch({ control, name: 'host' });
  const kind = useWatch({ control, name: 'kind' });
  const isCouchbase = kind === 'couchbase';
  const isPrometheusEndpoint = useWatch({
    control,
    name: 'isPrometheusEndpoint',
  });

  const createConnection = useCreateConnection();
  const updateConnection = useUpdateConnection();
  const deleteConnection = useDeleteConnection();

  const onSubmit = (data: ConnectionFormValues) => {
    const base = {
      id: data.id,
      name: data.name,
      username: data.username,
      password: data.password,
    };
    const stripped = data.host ? stripTrailingSlash(data.host) : '';
    const normalizedData: Connection =
      data.kind === 'couchbase'
        ? {
            ...base,
            kind: 'couchbase',
            host: data.host.trim(),
            wanProfile: data.wanProfile,
            monitorUsername: data.monitorUsername?.trim() ?? '',
            // Write-only: blank keeps the stored password on update.
            ...(data.monitorPassword
              ? { monitorPassword: data.monitorPassword }
              : {}),
            // Null clears a stored port so the scheme default applies.
            managementPort: data.managementPort?.trim()
              ? Number(data.managementPort)
              : null,
            // Write-only: blank keeps the stored certificate on update.
            ...(data.tlsCaCertificate?.trim()
              ? { tlsCaCertificate: data.tlsCaCertificate.trim() }
              : {}),
          }
        : data.isPrometheusEndpoint
          ? {
              ...base,
              kind: 'clickhouse',
              host: stripped,
              username: '',
              hyperdxSettingPrefix: null,
              isPrometheusEndpoint: true,
            }
          : {
              ...base,
              kind: 'clickhouse',
              host: stripped,
              hyperdxSettingPrefix: data.hyperdxSettingPrefix || null,
              isPrometheusEndpoint: data.isPrometheusEndpoint,
            };

    if (isNew) {
      const connection = omit(normalizedData, ['id']);
      createConnection.mutate(
        { connection },
        {
          onSuccess: () => {
            notifications.show({
              color: 'green',
              message: 'Connection created successfully',
            });
            onSave?.();
          },
          onError: () => {
            notifications.show({
              color: 'red',
              message:
                'Error creating connection, please check the host and credentials and try again.',
              autoClose: 5000,
            });
          },
        },
      );
    } else {
      updateConnection.mutate(
        { connection: normalizedData, id: connection.id },
        {
          onSuccess: () => {
            notifications.show({
              color: 'green',
              message: 'Connection updated successfully',
            });
            onSave?.();
          },
          onError: () => {
            notifications.show({
              color: 'red',
              message:
                'Error updating connection, please check the host and credentials and try again.',
              autoClose: 5000,
            });
          },
        },
      );
    }
  };

  const [showUpdatePassword, setShowUpdatePassword] = useState(false);
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  const { testConnectionState, handleTestConnection } = useTestConnection({
    getValues,
    connectionId: connection.id,
    isNew,
  });

  const passwordField = (
    <>
      {!showUpdatePassword && !isNew && (
        <Button
          data-testid="update-password-button"
          variant="secondary"
          onClick={() => {
            setShowUpdatePassword(true);
          }}
        >
          Update Password
        </Button>
      )}
      {(showUpdatePassword || isNew) && (
        <Flex align="center" gap="sm">
          <PasswordInputControlled
            data-testid="connection-password-input"
            style={{ flexGrow: 1 }}
            name="password"
            control={control}
            placeholder="Password (default: blank)"
          />
          {!isNew && (
            <Button
              data-testid="cancel-password-button"
              variant="secondary"
              onClick={() => {
                setShowUpdatePassword(false);
                resetField('password');
              }}
            >
              Cancel
            </Button>
          )}
        </Flex>
      )}
    </>
  );

  return (
    <form
      data-testid="connection-form"
      onSubmit={e => {
        e.preventDefault();
        handleSubmit(d => {
          onSubmit(d);
        })();
      }}
    >
      <Stack gap="md">
        <Box>
          <Text size="xs" mb="xs">
            Connection Name
          </Text>
          <InputControlled
            data-testid="connection-name-input"
            name="name"
            control={control}
            placeholder="My Clickhouse Server"
            rules={{ required: 'Connection name is required' }}
          />
        </Box>
        {!IS_LOCAL_MODE && isNew && (
          <Controller
            control={control}
            name="kind"
            render={({ field: { value, onChange } }) => (
              <SegmentedControl
                data-testid="connection-kind-selector"
                value={value}
                onChange={v => {
                  onChange(v);
                  if (formState.isSubmitted || formState.touchedFields.host) {
                    void trigger('host');
                  }
                }}
                data={[
                  { label: KIND_LABELS.clickhouse, value: 'clickhouse' },
                  { label: KIND_LABELS.couchbase, value: 'couchbase' },
                ]}
              />
            )}
          />
        )}
        {!IS_LOCAL_MODE && !isNew && (
          <Text size="xs" data-testid="connection-kind-label">
            Type: {KIND_LABELS[kind]}
          </Text>
        )}
        {isCouchbase ? (
          <CouchbaseConnectionFields
            control={control}
            setValue={setValue}
            isNew={isNew}
            passwordField={passwordField}
          />
        ) : (
          <>
            <Box>
              <Group gap="xs" mb="xs">
                <Text size="xs">Host</Text>
                <Tooltip
                  label={
                    isPrometheusEndpoint
                      ? 'Prometheus-compatible API endpoint. PromQL queries are proxied to this URL.'
                      : 'ClickHouse HTTP endpoint URL.'
                  }
                  color="dark"
                  c="white"
                  multiline
                  maw={400}
                >
                  <IconHelpCircle size={16} className="cursor-pointer" />
                </Tooltip>
              </Group>
              <TextInputControlled
                data-testid="connection-host-input"
                name="host"
                control={control}
                placeholder={
                  isPrometheusEndpoint
                    ? 'http://thanos-querier:10902'
                    : IS_CLICKHOUSE_BUILD
                      ? window.location.origin
                      : 'http://localhost:8123'
                }
                rules={{
                  validate: value => {
                    if (typeof value !== 'string' || !value) {
                      return 'Host is required';
                    }
                    if (isPrometheusEndpoint) {
                      try {
                        new URL(value);
                        return true;
                      } catch {
                        return 'Must be a valid URL';
                      }
                    }
                    return true;
                  },
                }}
              />
            </Box>
            {!isPrometheusEndpoint && (
              <>
                <Box>
                  <Text size="xs" mb="xs">
                    Username
                  </Text>
                  <InputControlled
                    data-testid="connection-username-input"
                    name="username"
                    control={control}
                    placeholder="Username (default: default)"
                  />
                </Box>
                <Box>
                  <Text size="xs" mb="xs">
                    Password
                  </Text>
                  {passwordField}
                </Box>
              </>
            )}
            <Box>
              {!showAdvancedSettings && (
                <Anchor
                  underline="always"
                  onClick={() => setShowAdvancedSettings(true)}
                  size="xs"
                >
                  <Group gap="xs">
                    <IconSettings size={14} />
                    Advanced Settings
                  </Group>
                </Anchor>
              )}
              {showAdvancedSettings && (
                <Button
                  onClick={() => setShowAdvancedSettings(false)}
                  size="xs"
                  variant="subtle"
                >
                  Hide Advanced Settings
                </Button>
              )}
            </Box>
            <Box
              style={{
                display: showAdvancedSettings ? 'block' : 'none',
              }}
            >
              <Stack gap="md">
                {IS_PROMQL_ENABLED && (
                  <Box>
                    <Controller
                      control={control}
                      name="isPrometheusEndpoint"
                      render={({ field: { value, onChange } }) => (
                        <Group gap="xs">
                          <Switch
                            data-testid="connection-prometheus-compatible-switch"
                            checked={!!value}
                            onChange={e => {
                              onChange(e.currentTarget.checked);
                              if (
                                formState.isSubmitted ||
                                formState.touchedFields.host
                              ) {
                                void trigger('host');
                              }
                            }}
                          />
                          <Text size="sm">Prometheus compatible</Text>
                          <Tooltip
                            label="Treat the Host as a Prometheus-compatible API endpoint (e.g. Thanos). PromQL queries are proxied here. ClickHouse-backed sources (logs, traces, OTel metrics) are not available on this connection."
                            color="dark"
                            c="white"
                            multiline
                            maw={400}
                          >
                            <IconHelpCircle
                              size={16}
                              className="cursor-pointer"
                            />
                          </Tooltip>
                        </Group>
                      )}
                    />
                  </Box>
                )}
                {!isPrometheusEndpoint && (
                  <Box>
                    <Group gap="xs" mb="xs">
                      <Text size="xs">Query Log Setting Prefix</Text>
                      <Tooltip
                        label="Tracks query origins by adding the current user's email to ClickHouse queries (as {prefix}_user in system.query_log). Requires 'custom_settings_prefixes' in your ClickHouse config.xml to include this exact value, otherwise queries will be rejected."
                        color="dark"
                        c="white"
                        multiline
                        maw={400}
                      >
                        <IconHelpCircle size={16} className="cursor-pointer" />
                      </Tooltip>
                    </Group>
                    <InputControlled
                      data-testid="connection-setting-prefix-input"
                      name="hyperdxSettingPrefix"
                      control={control}
                      placeholder="hyperdx"
                    />
                  </Box>
                )}
              </Stack>
            </Box>
          </>
        )}
        <Group justify="space-between">
          <Tooltip
            label={
              isCouchbase
                ? 'Enter a connection string to test the connection.'
                : isPrometheusEndpoint
                  ? 'Test Connection only verifies ClickHouse hosts; Prometheus-compatible endpoints have no equivalent probe.'
                  : !watchedHost
                    ? 'Enter a ClickHouse host to test the connection.'
                    : '🔒 Password re-entry required for security'
            }
            position="right"
            disabled={
              isCouchbase
                ? !!watchedHost
                : isNew && !!watchedHost && !isPrometheusEndpoint
            }
            withArrow
          >
            <Button
              disabled={
                !formState.isValid ||
                !watchedHost ||
                (!isCouchbase && isPrometheusEndpoint)
              }
              variant={
                testConnectionState === TestConnectionState.Invalid
                  ? 'danger'
                  : 'secondary'
              }
              type="button"
              onClick={handleTestConnection}
              loading={testConnectionState === TestConnectionState.Loading}
            >
              {testConnectionState === TestConnectionState.Valid ? (
                <>Connection successful</>
              ) : testConnectionState === TestConnectionState.Invalid ? (
                <>Unable to connect</>
              ) : (
                'Test Connection'
              )}
            </Button>
          </Tooltip>
          <Group gap="xs">
            {onClose && showCancelButton && (
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
            )}
            {!isNew && showDeleteButton !== false && (
              <ConfirmDeleteMenu
                onDelete={() =>
                  deleteConnection.mutate(
                    { id: connection.id },
                    {
                      onSuccess: () => {
                        onClose?.();
                      },
                    },
                  )
                }
              />
            )}
            <Button
              data-testid="connection-save-button"
              variant="primary"
              type="submit"
              loading={
                isNew ? createConnection.isPending : updateConnection.isPending
              }
            >
              {isNew ? 'Create' : 'Save'} Connection
            </Button>
          </Group>
        </Group>
      </Stack>
    </form>
  );
}
