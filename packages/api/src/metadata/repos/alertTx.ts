import type { Id } from '@/metadata/ids';
import { iso } from '@/metadata/schemas/common';
import { FIND_LIMIT_MAX, type FindScalar, type MetaTx } from '@/metadata/types';

/**
 * Inside a transaction: removes the alerts matching `where`. The reads go
 * through the transaction's query context, so each round sees the removals of
 * the one before and the loop ends when a round comes back short.
 */
export async function removeAlertsInTx(
  tx: MetaTx,
  where: Record<string, FindScalar>,
): Promise<number> {
  let removed = 0;
  for (;;) {
    const found = await tx.find('alerts', { where, limit: FIND_LIMIT_MAX });
    for (const a of found) await tx.remove('alerts', a.key);
    removed += found.length;
    if (found.length < FIND_LIMIT_MAX) return removed;
  }
}

/** Inside a transaction: points the alerts `from` created at `to`. */
export async function reassignAlertsInTx(
  tx: MetaTx,
  team: Id,
  from: Id,
  to: Id,
  at: Date,
): Promise<number> {
  let moved = 0;
  for (;;) {
    const found = await tx.find<Record<string, unknown>>('alerts', {
      where: { team, createdBy: from },
      limit: FIND_LIMIT_MAX,
    });
    for (const a of found) {
      await tx.replace('alerts', a.key, {
        ...a.value,
        createdBy: to,
        updatedAt: iso(at),
      });
    }
    moved += found.length;
    if (found.length < FIND_LIMIT_MAX) return moved;
  }
}
