import type {
  CreateOrgApiKeyRequest,
  OrgApiKeyApiResponse,
  OrgApiKeyExpiry,
} from '@couchbase-traces/common-utils/dist/types';
import opentelemetry from '@opentelemetry/api';
import crypto from 'crypto';

import {
  createVirtualUser,
  hashOrgApiKey,
  ORG_API_KEY_PREFIX,
} from '@/controllers/user';
import { getMetadataStore } from '@/metadata';
import type { IUser, UserDisplay } from '@/metadata/schemas/user';
import { getCounter } from '@/utils/instrumentation';
import logger from '@/utils/logger';

type IdLike = string | { toString(): string };

const DAY_MS = 24 * 60 * 60 * 1000;
const LAST_USED_WRITE_INTERVAL_MS = 5 * 60 * 1000;

const lastUsedWriteFailures = getCounter(
  'cbt.org_api_key.last_used_write_failures',
  { description: 'Failed writes of an org API key last-used time.' },
);

const users = () => getMetadataStore().users;

function expiresAtFor(expiry: OrgApiKeyExpiry, now: number): Date | null {
  switch (expiry) {
    case '30d':
      return new Date(now + 30 * DAY_MS);
    case '1y':
      return new Date(now + 365 * DAY_MS);
    case 'never':
      return null;
  }
}

export async function createOrgApiKey(
  teamId: IdLike,
  createdBy: IdLike,
  { description, expiry }: CreateOrgApiKeyRequest,
) {
  const key = `${ORG_API_KEY_PREFIX}${crypto.randomBytes(32).toString('base64url')}`;
  // `.invalid` is reserved, so the email can never reach a real inbox.
  const doc = await createVirtualUser({
    teamId: teamId.toString(),
    name: description,
    email: `sa-${crypto.randomBytes(12).toString('hex')}@service-accounts.couchbase-traces.invalid`,
    accessKey: hashOrgApiKey(key),
    expiresAt: expiresAtFor(expiry, Date.now()),
    createdBy: createdBy.toString(),
  });
  return { doc, key };
}

export function listOrgApiKeys(teamId: IdLike) {
  return users().listOrgKeys(teamId.toString());
}

export function updateOrgApiKeyDescription(
  teamId: IdLike,
  id: string,
  description: string,
) {
  return users().setOrgKeyName(teamId.toString(), id, description);
}

// Marks rather than deletes, so anything the account created keeps its author.
export function revokeOrgApiKey(teamId: IdLike, id: string) {
  return users().revokeOrgKey(teamId.toString(), id, new Date());
}

// Fire-and-forget so auth never waits on or fails because of this write. The
// conditional update stops concurrent requests from all writing at once.
export function touchOrgApiKeyLastUsed(
  doc: Pick<IUser, '_id' | 'lastUsedAt'>,
  now = new Date(),
) {
  const staleBefore = new Date(now.getTime() - LAST_USED_WRITE_INTERVAL_MS);
  if (doc.lastUsedAt != null && doc.lastUsedAt > staleBefore) {
    return;
  }
  // Captured now: the write settles after the request may have moved on.
  const span = opentelemetry.trace.getActiveSpan();
  void Promise.resolve()
    .then(() => users().touchLastUsed(doc._id, now, staleBefore))
    .catch(err => {
      lastUsedWriteFailures.add(1);
      span?.recordException(
        err instanceof Error ? err : new Error(String(err)),
      );
      logger.warn(
        { error: err, orgApiKeyId: doc._id },
        'Failed to record org API key last use',
      );
    });
}

/** Formats keys with their creators, read in one batch (was `populate`). */
export async function formatOrgApiKeys(
  docs: IUser[],
): Promise<OrgApiKeyApiResponse[]> {
  const creators = await users().getDisplay(docs.map(d => d.createdBy));
  return docs.map(d =>
    formatOrgApiKey(d, d.createdBy ? creators.get(d.createdBy) : undefined),
  );
}

export function formatOrgApiKey(
  doc: IUser,
  creator?: UserDisplay | null,
): OrgApiKeyApiResponse {
  return {
    id: doc._id,
    description: doc.name ?? '',
    createdAt: doc.createdAt.toISOString(),
    expiresAt: doc.expiresAt?.toISOString() ?? null,
    lastUsedAt: doc.lastUsedAt?.toISOString() ?? null,
    createdBy: creator
      ? { id: creator._id, name: creator.name, email: creator.email }
      : null,
  };
}
