import type { Cluster } from 'couchbase';

import { SetupError } from '@/setup/errors';

const USERS = [
  {
    userEnv: 'CBT_COUCHBASE_QUERY_USER',
    passwordEnv: 'CBT_COUCHBASE_QUERY_PASSWORD',
    roles: (bucket: string, _scope: string) => [
      `query_select[${bucket}]`,
      'query_system_catalog',
      `fts_searcher[${bucket}]`,
    ],
  },
  {
    userEnv: 'CBT_COUCHBASE_INGEST_USER',
    passwordEnv: 'CBT_COUCHBASE_INGEST_PASSWORD',
    roles: (bucket: string, scope: string) => [
      `data_writer[${bucket}:${scope}]`,
      `data_reader[${bucket}:${scope}]`,
    ],
  },
  {
    // Read-Only Admin covers GET /pools/default, /buckets, /tasks, and the
    // statistics range API. external_stats_reader only allows /metrics.
    userEnv: 'CBT_COUCHBASE_MONITOR_USER',
    passwordEnv: 'CBT_COUCHBASE_MONITOR_PASSWORD',
    roles: (_bucket: string, _scope: string) => ['ro_admin'],
  },
] as const;

export function capellaAccess(bucket: string, scope: string): string[] {
  return USERS.flatMap(user => [
    `${user.userEnv}: ${user.roles(bucket, scope).join(', ')}`,
  ]);
}

export async function ensureUsers(
  cluster: Cluster,
  opts: {
    env: NodeJS.ProcessEnv;
    bucket: string;
    scope: string;
    capella: boolean;
    log: (line: string) => void;
  },
): Promise<void> {
  if (opts.capella) {
    opts.log(
      'skipped users (Capella: create these database access credentials)',
    );
    for (const line of capellaAccess(opts.bucket, opts.scope)) opts.log(line);
    opts.log(
      'A monitoring credential is optional. Cluster management APIs may be restricted on Capella.',
    );
    return;
  }
  for (const user of USERS) {
    const username = opts.env[user.userEnv];
    const password = opts.env[user.passwordEnv];
    if (!username) throw new SetupError(`${user.userEnv} is required`, 1);
    if (!password) throw new SetupError(`${user.passwordEnv} is required`, 1);
    let existed = false;
    try {
      await cluster.users().getUser(username);
      existed = true;
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (!name.includes('NotFound')) throw err;
    }
    await cluster.users().upsertUser({
      username,
      password,
      roles: user.roles(opts.bucket, opts.scope),
    });
    opts.log(`${existed ? 'exists' : 'created'} user ${username}`);
  }
}
