import {
  hasDocuments,
  type SourceKeyspace,
} from '@couchbase-traces/common-utils/dist/couchbase/documentPresence';
import { useQuery } from '@tanstack/react-query';

import { useDataClient } from '@/query';

// The card can't gate on its own visibility (completion depends on this), so
// a stale window avoids refetching on every focus for in-window teams.
const DATA_PRESENCE_STALE_MS = 5 * 60 * 1000;

/**
 * Whether any of the given source collections has documents. The SQL++ runs
 * on the API through the proxied data client; the browser only sends the
 * statement it builds from quoted identifiers.
 */
export function useSourceDataPresence(args: {
  connectionId: string;
  keyspaces: SourceKeyspace[];
  enabled: boolean;
}): { hasData: boolean | undefined; isLoading: boolean } {
  const dataClient = useDataClient({ attribution: { surface: 'metadata' } });
  const { data, isLoading, isError } = useQuery({
    queryKey: ['onboarding.dataPresence', args.connectionId, args.keyspaces],
    queryFn: () =>
      hasDocuments(dataClient, {
        connectionId: args.connectionId,
        keyspaces: args.keyspaces,
      }),
    enabled: args.enabled,
    staleTime: DATA_PRESENCE_STALE_MS,
  });
  if (!args.enabled) return { hasData: undefined, isLoading };
  // A failed probe leaves the step open rather than blocking the checklist.
  return { hasData: isError ? false : data, isLoading };
}
