import type { TeamQuerySettings } from '@couchbase-traces/common-utils/dist/types';

import { DataClient } from '@/dataClient';

export function createTeamDataClient(
  team?: TeamQuerySettings | null,
  requestTimeout?: number,
): DataClient {
  return new DataClient({
    team: team ?? undefined,
    ...(requestTimeout != null ? { requestTimeout } : {}),
  });
}
