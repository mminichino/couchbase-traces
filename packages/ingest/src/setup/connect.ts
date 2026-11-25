import { SetupError } from '@/setup/errors';

// D30: right after clusterInit (or a password change), ns_server answers REST
// with the new admin password at once, but the data service (memcached) takes
// about a second longer to learn it. Measured on enterprise-8.0.3: REST 200 at
// +70 ms, SDK connect `AuthenticationFailureError` until roughly +1 s. A setup
// that connects in that window fails. Retry only that error, with bounded
// backoff, so a genuinely wrong password still fails within the deadline.

export type ConnectRetryOptions = {
  /** Total time to keep retrying authentication failures. */
  deadlineMs: number;
  log: (line: string) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

const INITIAL_DELAY_MS = 250;
const MAX_DELAY_MS = 4000;

function isAuthFailure(err: unknown): boolean {
  return err instanceof Error && err.name === 'AuthenticationFailureError';
}

export async function connectWithAuthRetry<T>(
  connect: () => Promise<T>,
  opts: ConnectRetryOptions,
): Promise<T> {
  const now = opts.now ?? Date.now;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)));
  const start = now();
  let delay = INITIAL_DELAY_MS;
  let logged = false;
  for (;;) {
    try {
      return await connect();
    } catch (err) {
      if (!isAuthFailure(err)) throw err;
      const remaining = opts.deadlineMs - (now() - start);
      if (remaining <= 0) {
        throw new SetupError(
          `Couchbase still rejected the admin credentials after ${Math.round(opts.deadlineMs / 1000)}s; ` +
            'check CBT_COUCHBASE_ADMIN_USER and CBT_COUCHBASE_ADMIN_PASSWORD',
          3,
        );
      }
      if (!logged) {
        opts.log(
          'Couchbase data service has not accepted the admin credentials yet; retrying',
        );
        logged = true;
      }
      await sleep(Math.min(delay, remaining));
      delay = Math.min(delay * 2, MAX_DELAY_MS);
    }
  }
}
