import { type ReactNode, useEffect, useRef } from 'react';
import {
  Control,
  Controller,
  UseFormSetValue,
  useWatch,
} from 'react-hook-form';
import {
  isCapellaHost,
  isValidCouchbaseConnStr,
  parseConnStr,
} from '@couchbase-traces/common-utils/dist/couchbase/connstr';
import type { ConnectionKind } from '@couchbase-traces/common-utils/dist/types';
import { Box, Checkbox, Text, Textarea } from '@mantine/core';

import {
  InputControlled,
  PasswordInputControlled,
  TextInputControlled,
} from '@/components/InputControlled';

/** Fields of both connection kinds; the form submits only those of `kind`. */
export type ConnectionFormValues = {
  id: string;
  name: string;
  kind: ConnectionKind;
  host: string;
  username: string;
  password?: string;
  hyperdxSettingPrefix?: string | null;
  isPrometheusEndpoint?: boolean;
  wanProfile?: boolean;
  tlsCaCertificate?: string;
  monitorUsername?: string;
  monitorPassword?: string;
  managementPort?: string;
};

export const COUCHBASE_HELP_TEXT =
  "Capella: use the connection string from the cluster's Connect page and add this server's IP to the allowed IPs. Use a database user with read access to the collections you will query.";

const isTlsScheme = (host: string | undefined) =>
  /^couchbases:\/\//i.test(host?.trim() ?? '');

/** The CA field applies to self-managed TLS clusters; Capella uses a public CA. */
function needsCaCertificate(host: string | undefined): boolean {
  if (!isTlsScheme(host)) return false;
  try {
    return !isCapellaHost(parseConnStr(host ?? ''));
  } catch {
    return true;
  }
}

export function CouchbaseConnectionFields({
  control,
  setValue,
  isNew,
  passwordField,
}: {
  control: Control<ConnectionFormValues>;
  setValue: UseFormSetValue<ConnectionFormValues>;
  isNew: boolean;
  passwordField: ReactNode;
}) {
  const host = useWatch({ control, name: 'host' });
  const wanTouchedRef = useRef(false);
  const tls = isTlsScheme(host);
  const prevTlsRef = useRef(tls);

  // Follow the scheme's default until the user picks a value themselves.
  useEffect(() => {
    if (prevTlsRef.current === tls) return;
    prevTlsRef.current = tls;
    if (!wanTouchedRef.current) setValue('wanProfile', tls);
  }, [tls, setValue]);

  return (
    <>
      <Text size="xs" c="dimmed">
        {COUCHBASE_HELP_TEXT}
      </Text>
      <Box>
        <Text size="xs" mb="xs">
          Connection string
        </Text>
        <TextInputControlled
          data-testid="connection-host-input"
          name="host"
          control={control}
          placeholder="couchbases://cb.example.cloud.couchbase.com"
          rules={{
            validate: value => {
              if (typeof value !== 'string' || !value.trim()) {
                return 'Connection string is required';
              }
              return isValidCouchbaseConnStr(value.trim())
                ? true
                : 'Must be a couchbase:// or couchbases:// connection string';
            },
          }}
        />
      </Box>
      <Box>
        <Text size="xs" mb="xs">
          Username
        </Text>
        <InputControlled
          data-testid="connection-username-input"
          name="username"
          control={control}
          placeholder="Database user"
          rules={{ required: 'Username is required' }}
        />
      </Box>
      <Box>
        <Text size="xs" mb="xs">
          Password
        </Text>
        {passwordField}
      </Box>
      <Controller
        control={control}
        name="wanProfile"
        render={({ field: { value, onChange } }) => (
          <Checkbox
            data-testid="connection-wan-profile-checkbox"
            label="Use WAN profile"
            checked={!!value}
            onChange={e => {
              wanTouchedRef.current = true;
              onChange(e.currentTarget.checked);
            }}
          />
        )}
      />
      {needsCaCertificate(host) && (
        <Box>
          <Text size="xs" mb="xs">
            CA certificate (PEM)
          </Text>
          <Controller
            control={control}
            name="tlsCaCertificate"
            render={({ field }) => (
              <Textarea
                {...field}
                value={field.value ?? ''}
                data-testid="connection-ca-certificate-input"
                autosize
                minRows={3}
                maxRows={8}
                placeholder={
                  isNew
                    ? '-----BEGIN CERTIFICATE-----'
                    : 'Leave blank to keep the stored certificate'
                }
              />
            )}
          />
        </Box>
      )}
      <Box>
        <Text size="xs" mb="xs">
          Monitoring username
        </Text>
        <InputControlled
          data-testid="connection-monitor-username-input"
          name="monitorUsername"
          control={control}
          placeholder="Optional. Used for cluster status and metrics"
        />
      </Box>
      <Box>
        <Text size="xs" mb="xs">
          Monitoring password
        </Text>
        <PasswordInputControlled
          data-testid="connection-monitor-password-input"
          name="monitorPassword"
          control={control}
          placeholder={
            isNew ? 'Optional' : 'Leave blank to keep the stored password'
          }
        />
      </Box>
      <Box>
        <Text size="xs" mb="xs">
          Management port
        </Text>
        <TextInputControlled
          data-testid="connection-management-port-input"
          name="managementPort"
          control={control}
          placeholder="Default (8091 or 18091)"
          rules={{
            validate: value => {
              if (typeof value !== 'string' || value.trim() === '') return true;
              const port = Number(value);
              return Number.isInteger(port) && port >= 1 && port <= 65535
                ? true
                : 'Port must be an integer from 1 to 65535';
            },
          }}
        />
      </Box>
    </>
  );
}
