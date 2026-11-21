import { useCallback, useState } from 'react';
import { omit } from 'lodash';
import { useForm, useWatch } from 'react-hook-form';
import {
  Connection,
  isCouchbaseConnection,
  type UnsupportedLegacyConnection,
} from '@couchbase-traces/common-utils/dist/types';
import { Box, Button, Flex, Group, Stack, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';

import {
  type ConnectionFormValues,
  CouchbaseConnectionFields,
} from '@/components/CouchbaseConnectionFields';
import {
  InputControlled,
  PasswordInputControlled,
} from '@/components/InputControlled';
import {
  testConnectionByKind,
  useCreateConnection,
  useDeleteConnection,
  useUpdateConnection,
} from '@/connection';

import ConfirmDeleteMenu from './ConfirmDeleteMenu';

enum TestConnectionState {
  Loading = 'loading',
  Valid = 'valid',
  Invalid = 'invalid',
}

function isUnsupportedLegacyConnection(
  connection: Connection,
): connection is UnsupportedLegacyConnection {
  return (
    connection.kind === 'clickhouse' &&
    'unsupported' in connection &&
    connection.unsupported === true
  );
}

function useTestConnection({
  getValues,
  connectionId,
  isNew,
}: {
  getValues: () => ConnectionFormValues;
  connectionId: string;
  isNew: boolean;
}) {
  const [testConnectionState, setTestConnectionState] =
    useState<TestConnectionState | null>(null);

  const handleTestConnection = useCallback(async () => {
    const values = getValues();
    const { username } = values;
    const password = values.password ?? '';
    const host = values.host.trim();

    if (testConnectionState) {
      return;
    }

    setTestConnectionState(TestConnectionState.Loading);

    try {
      const result = await testConnectionByKind({
        kind: 'couchbase',
        host,
        username,
        password: password || undefined,
        wanProfile: values.wanProfile,
        tlsCaCertificate: values.tlsCaCertificate || undefined,
        connectionId: isNew ? undefined : connectionId,
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

    setTimeout(() => {
      setTestConnectionState(null);
    }, 2000);
  }, [getValues, testConnectionState, connectionId, isNew]);

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
  const { control, handleSubmit, resetField, getValues, setValue, formState } =
    useForm<ConnectionFormValues>({
      defaultValues: {
        id: connection.id,
        name: connection.name,
        kind: 'couchbase',
        host: isCouchbaseConnection(connection) ? connection.host : '',
        username: isCouchbaseConnection(connection) ? connection.username : '',
        password: isCouchbaseConnection(connection) ? connection.password : '',
        wanProfile: isCouchbaseConnection(connection)
          ? (connection.wanProfile ??
            /^couchbases:\/\//i.test(connection.host ?? ''))
          : false,
        monitorUsername: isCouchbaseConnection(connection)
          ? (connection.monitorUsername ?? '')
          : '',
        managementPort:
          isCouchbaseConnection(connection) && connection.managementPort != null
            ? String(connection.managementPort)
            : '',
      },
    });

  const watchedHost = useWatch({ control, name: 'host' });

  const createConnection = useCreateConnection();
  const updateConnection = useUpdateConnection();
  const deleteConnection = useDeleteConnection();

  const onSubmit = (data: ConnectionFormValues) => {
    const normalizedData: Connection = {
      id: data.id,
      name: data.name,
      kind: 'couchbase',
      host: data.host.trim(),
      username: data.username,
      password: data.password,
      wanProfile: data.wanProfile,
      monitorUsername: data.monitorUsername?.trim() ?? '',
      ...(data.monitorPassword
        ? { monitorPassword: data.monitorPassword }
        : {}),
      managementPort: data.managementPort?.trim()
        ? Number(data.managementPort)
        : null,
      ...(data.tlsCaCertificate?.trim()
        ? { tlsCaCertificate: data.tlsCaCertificate.trim() }
        : {}),
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

  const { testConnectionState, handleTestConnection } = useTestConnection({
    getValues,
    connectionId: connection.id,
    isNew,
  });

  if (isUnsupportedLegacyConnection(connection)) {
    return (
      <Stack gap="md" data-testid="connection-form-unsupported">
        <Text fw={600}>ClickHouse (no longer supported)</Text>
        <Text size="sm" c="dimmed">
          This connection cannot be edited. Delete it and create a Couchbase
          connection to continue querying data.
        </Text>
        <Group justify="flex-end">
          {onClose && showCancelButton && (
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          )}
          {showDeleteButton !== false && (
            <ConfirmDeleteMenu
              onDelete={() =>
                deleteConnection.mutate(
                  { id: connection.id },
                  { onSuccess: () => onClose?.() },
                )
              }
            />
          )}
        </Group>
      </Stack>
    );
  }

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
            placeholder="My Couchbase cluster"
            rules={{ required: 'Connection name is required' }}
          />
        </Box>
        <CouchbaseConnectionFields
          control={control}
          setValue={setValue}
          isNew={isNew}
          passwordField={passwordField}
        />
        <Group justify="space-between">
          <Tooltip
            label="Enter a connection string to test the connection."
            position="right"
            disabled={!!watchedHost}
            withArrow
          >
            <Button
              disabled={!formState.isValid || !watchedHost}
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
