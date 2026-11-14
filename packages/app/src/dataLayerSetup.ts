import { setConnectionKindResolver } from '@couchbase-traces/common-utils/dist/dataLayer';
import type { Connection } from '@couchbase-traces/common-utils/dist/types';
import { QueryClient } from '@tanstack/react-query';

import { hdxServer } from '@/api';

export function registerDataLayer(queryClient: QueryClient): void {
  setConnectionKindResolver(async id => {
    const connections = await queryClient.ensureQueryData<Connection[]>({
      queryKey: ['connections'],
      queryFn: () => hdxServer('connections').json(),
    });
    const found = connections.find(connection => connection.id === id);
    if (found == null) return undefined;
    return found.kind === 'couchbase' ? 'couchbase' : 'clickhouse';
  });
}
