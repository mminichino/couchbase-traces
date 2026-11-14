import type { SerializedQueryError } from '@couchbase-traces/common-utils/dist/couchbase/errors';
import { clearConnectionKindCache } from '@couchbase-traces/common-utils/dist/dataLayer';
import { Connection } from '@couchbase-traces/common-utils/dist/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { hdxServer } from '@/api';

/** Legacy local-mode storage key; local app mode was removed in Phase 10. */
export const LOCAL_STORE_CONNECTIONS_KEY = 'cbt-local-connections';

export function dataStoreLinks(connections: { kind?: string }[] | undefined): {
  hasCouchbase: boolean;
  hasClickHouse: boolean;
} {
  const list = connections ?? [];
  return {
    hasCouchbase: list.some(connection => connection.kind === 'couchbase'),
    hasClickHouse: list.some(
      connection => (connection.kind ?? 'clickhouse') !== 'couchbase',
    ),
  };
}

export function useConnections() {
  return useQuery<Connection[]>({
    queryKey: ['connections'],
    queryFn: () => hdxServer('connections').json(),
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
      const res = await hdxServer('connections', {
        method: 'POST',
        json: connection,
      }).json<{ id: string }>();

      return res;
    },
    onSuccess: () => {
      clearConnectionKindCache();
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
      await hdxServer(`connections/${id}`, {
        method: 'PUT',
        json: connection,
      });
    },
    onSuccess: () => {
      clearConnectionKindCache();
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
  return hdxServer('evalstore-proxy/test', {
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
    mutationFn: async ({ id }: { id: string }) => {
      await hdxServer(`connections/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      clearConnectionKindCache();
      queryClient.invalidateQueries({ queryKey: ['connections'] });
    },
  });
}
