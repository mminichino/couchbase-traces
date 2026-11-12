import store from 'store2';
import { testLocalConnection } from '@couchbase-traces/common-utils/dist/clickhouse/browser';
import type { SerializedQueryError } from '@couchbase-traces/common-utils/dist/couchbase/errors';
import { Connection } from '@couchbase-traces/common-utils/dist/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { hdxServer } from '@/api';
import { HDX_LOCAL_DEFAULT_CONNECTIONS, IS_LOCAL_MODE } from '@/config';
import { parseJSON } from '@/utils';

export const LOCAL_STORE_CONNECTIONS_KEY = 'connections';

function setLocalConnections(newConnections: Connection[]) {
  // sessing sessionStorage doesn't send a storage event to the open tab, only
  // another tab. Let's send one anyways for any listeners in other components
  const storageEvent = new StorageEvent('storage', {
    key: LOCAL_STORE_CONNECTIONS_KEY,
    oldValue: store.session.get(LOCAL_STORE_CONNECTIONS_KEY),
    newValue: JSON.stringify(newConnections),
    storageArea: window.sessionStorage,
    url: window.location.href,
  });
  store.session.set(LOCAL_STORE_CONNECTIONS_KEY, newConnections);
  window.dispatchEvent(storageEvent);
}

export function getLocalConnections(): Connection[] {
  if (store.session.has(LOCAL_STORE_CONNECTIONS_KEY)) {
    return store.session.get(LOCAL_STORE_CONNECTIONS_KEY) ?? [];
  }
  // pull sources from env var
  try {
    const defaultConnections = parseJSON(HDX_LOCAL_DEFAULT_CONNECTIONS ?? '');
    if (defaultConnections != null) {
      return defaultConnections;
    }
  } catch (e) {
    console.error('Error fetching default connections', e);
  }
  // fallback to empty array
  return [];
}

export function useConnections() {
  return useQuery<Connection[]>({
    queryKey: ['connections'],
    queryFn: () => {
      if (IS_LOCAL_MODE) {
        return getLocalConnections();
      }

      return hdxServer('connections').json();
    },
  });
}

export function useCreateConnection() {
  const queryClient = useQueryClient();

  return useMutation<
    { id: string },
    Error,
    { connection: Omit<Connection, 'id'> }
  >({
    mutationFn: async ({ connection }) => {
      if (IS_LOCAL_MODE) {
        const isValid = await testLocalConnection({
          host: connection.host,
          username: connection.username,
          password: connection.password ?? '',
        });

        if (!isValid) {
          throw new Error(
            'Could not connect to Clickhouse with connection details',
          );
        }

        // id key in local connection and return value
        const createdConnection = { id: 'local' };

        // should be only one connection
        setLocalConnections([
          {
            ...connection,
            ...createdConnection,
          },
        ]);
        return createdConnection;
      }

      const res = await hdxServer('connections', {
        method: 'POST',
        json: connection,
      }).json<{ id: string }>();

      return res;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
      queryClient.invalidateQueries({ queryKey: ['sources'] });
    },
  });
}

export function useUpdateConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      connection,
      id,
    }: {
      connection: Connection;
      id: string;
    }) => {
      if (IS_LOCAL_MODE) {
        // should be only one connection
        setLocalConnections([
          {
            ...connection,
            id: 'local',
          },
        ]);

        return;
      }

      await hdxServer(`connections/${id}`, {
        method: 'PUT',
        json: connection,
      });

      return;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
  });
}

export type ConnectionTestResult = { success: boolean; error?: string };

export type ConnectionTestRequest =
  | { kind: 'clickhouse'; host: string; username: string; password: string }
  | {
      kind: 'couchbase';
      host: string;
      username: string;
      // Omitted secrets fall back to the stored ones when connectionId is set.
      password?: string;
      wanProfile?: boolean;
      tlsCaCertificate?: string;
      connectionId?: string;
    };

/** Tests a connection through the API route for its kind. */
export async function testConnectionByKind(
  request: ConnectionTestRequest,
): Promise<ConnectionTestResult> {
  if (request.kind === 'couchbase') {
    const { kind: _kind, ...body } = request;
    const res = await hdxServer('couchbase/test', {
      method: 'POST',
      json: body,
      throwHttpErrors: false,
    }).json<{ success: boolean; error?: SerializedQueryError }>();
    return {
      success: res.success === true,
      error: res.error?.message,
    };
  }
  const { host, username, password } = request;
  return hdxServer('clickhouse-proxy/test', {
    method: 'POST',
    json: { host, username, password },
  }).json<ConnectionTestResult>();
}

export function useTestConnectionByKind() {
  return useMutation<ConnectionTestResult, Error, ConnectionTestRequest>({
    mutationFn: testConnectionByKind,
  });
}

export type CollectionTestResult =
  | { success: true; sampleKeys: string[] }
  | { success: false; error: string };

export function useTestCouchbaseCollection() {
  return useMutation<
    CollectionTestResult,
    Error,
    { connectionId: string; bucket: string; scope: string; collection: string }
  >({
    mutationFn: async body => {
      const res = await hdxServer('couchbase/test-source', {
        method: 'POST',
        json: body,
        throwHttpErrors: false,
      }).json<
        | { success: true; sampleKeys: string[] }
        | { success: false; error?: SerializedQueryError }
      >();
      return res.success
        ? res
        : {
            success: false,
            error: res.error?.message ?? 'Collection test failed',
          };
    },
  });
}

export function useDeleteConnection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
    }: {
      id: string; // Ignored for local
    }) => {
      if (IS_LOCAL_MODE) {
        const connections = getLocalConnections();
        const newConnections = connections.filter(
          connection => connection.id !== id,
        );
        setLocalConnections(newConnections);

        return;
      }

      await hdxServer(`connections/${id}`, {
        method: 'DELETE',
      });

      return;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
  });
}
