import os from 'os';

import {
  closeMetadataStore,
  getMetadataStore,
  metadataReadiness,
  newId,
  startMetadataStore,
} from '@/metadata';
import type { Lease } from '@/metadata/types';
import logger from '@/utils/logger';

export const CHECK_ALERTS_LOCK = 'check-alerts';

export type SchedulerLeaseOptions = {
  enabled: boolean;
  tickMs: number;
  appVersion?: string;
};

/**
 * Runs `fn` only while holding the `lock::check-alerts` lease (D9). The TTL is
 * twice the tick and the lease is renewed every tick, so a crashed holder
 * frees it within two ticks and a slow evaluation keeps it. A second runner
 * skips the tick. Returns false when the tick was skipped.
 *
 * This wraps the task from outside so the alert task itself is unchanged.
 */
export async function runWithSchedulerLease(
  opts: SchedulerLeaseOptions,
  fn: () => Promise<void>,
): Promise<boolean> {
  if (!opts.enabled) {
    await fn();
    return true;
  }

  const ownsStore = metadataReadiness().state === 'disabled';
  if (ownsStore) {
    await startMetadataStore({ logger, appVersion: opts.appVersion });
  }
  try {
    const locks = getMetadataStore().locks;
    const ttlMs = opts.tickMs * 2;
    const owner = `${os.hostname()}:${process.pid}:${newId()}`;
    const lease = await locks.acquire(CHECK_ALERTS_LOCK, ttlMs, owner);
    if (lease == null) {
      logger.debug(
        'Another runner holds the check-alerts lease; skipping this tick',
      );
      return false;
    }

    let held: Lease = lease;
    let renewing = Promise.resolve();
    const timer = setInterval(() => {
      renewing = renewing.then(async () => {
        try {
          const next = await locks.renew(held, ttlMs);
          if (next == null) {
            logger.warn('Lost the check-alerts lease while running');
          } else {
            held = next;
          }
        } catch (err) {
          logger.warn({ err }, 'Failed to renew the check-alerts lease');
        }
      });
    }, opts.tickMs);
    timer.unref();

    try {
      await fn();
    } finally {
      clearInterval(timer);
      await renewing;
      await locks.release(held).catch(err => {
        logger.warn({ err }, 'Failed to release the check-alerts lease');
      });
    }
    return true;
  } finally {
    if (ownsStore) await closeMetadataStore();
  }
}
